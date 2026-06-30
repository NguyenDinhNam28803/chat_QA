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
];
