export interface FeedSource {
  id: string;
  name: string;
  url: string;
}

export const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: 'vnexpress-moinhat',
    name: 'VnExpress - Tin mới nhất',
    url: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
  },
  {
    id: 'tuoitre-moinhat',
    name: 'Tuổi Trẻ - Mới nhất',
    url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss',
  },
  {
    id: 'thanhnien-moinhat',
    name: 'Thanh Niên - Mới nhất',
    url: 'https://thanhnien.vn/rss.rss',
  },
  {
    // Note: VietNamNet's real RSS URLs drop the /rss/ prefix; it has no
    // "tin mới nhất" aggregate feed, so thời sự covers general news.
    id: 'vietnamnet-thoisu',
    name: 'VietNamNet - Thời sự',
    url: 'https://vietnamnet.vn/thoi-su.rss',
  },
  {
    id: 'vietnamnet-congnghe',
    name: 'VietNamNet - Công nghệ',
    url: 'https://vietnamnet.vn/cong-nghe.rss',
  },
  {
    id: 'thanhnien-thegioi',
    name: 'Thanh Niên - Thế giới',
    url: 'https://thanhnien.vn/rss/the-gioi.rss',
  },
  {
    id: 'thanhnien-congnghe',
    name: 'Thanh Niên - Công nghệ',
    url: 'https://thanhnien.vn/rss/cong-nghe.rss',
  },
];
