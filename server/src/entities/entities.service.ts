import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Sentence-initial capitals that are NOT proper nouns (reduce NER noise).
const STOP_START = new Set(
  'Có Không Sau Trong Khi Dự Hơn Nhiều Một Hai Ba Vì Để Nếu Từ Đến Cả Các Những Người Ngày Giá Cựu Tân Ông Bà Anh Chị Hôm Bão Áp Nữ Chủ Phó Bộ Ban Vụ Vẫn Đã Sẽ Được Cùng Loạt Nhóm Thêm Chính Gần Vừa Tại Trên Dưới'.split(
    ' ',
  ),
);

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** (P3) Candidate entities = capitalized proper-noun phrases that recur in
   * headlines. Pure heuristic (no LLM): merge runs of Capitalized tokens, then
   * keep phrases seen in ≥3 headlines. */
  async listEntities(limit = 48): Promise<{ name: string; count: number }[]> {
    const rows = await this.prisma.article.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 1500,
      select: { title: true },
    });
    const freq = new Map<string, number>();
    for (const { title } of rows) {
      const tokens = title.split(/\s+/);
      let run: string[] = [];
      const flush = () => {
        if (run.length && run.length <= 5) {
          const phrase = run.join(' ').trim();
          if (phrase.length >= 2 && !/^\d+$/.test(phrase)) {
            freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
          }
        }
        run = [];
      };
      tokens.forEach((tok, i) => {
        const clean = tok.replace(/^["'(]+|[.,:;!?"')]+$/g, '');
        const isCap = /^\p{Lu}/u.test(clean);
        if (isCap && !(i === 0 && STOP_START.has(clean))) run.push(clean);
        else flush();
      });
      flush();
    }
    return [...freq.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  /** (P3) Dossier for one entity: mentions across sources + recent articles. */
  async getEntity(name: string) {
    const like = `%${name}%`;
    const arts = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        source: string;
        topic: string | null;
        publishedAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT "id", "title", "source", "topic", "publishedAt"
      FROM "Article"
      WHERE title ILIKE ${like}
         OR "contentTsv" @@ plainto_tsquery('simple', ${name})
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT 40
    `);

    const bySource = new Map<string, number>();
    for (const a of arts)
      bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);

    return {
      name,
      articleCount: arts.length,
      sources: [...bySource.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      articles: arts.slice(0, 20),
    };
  }
}
