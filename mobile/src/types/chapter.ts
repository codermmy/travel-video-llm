export interface EventChapter {
  id: string;
  chapterIndex: number;
  chapterTitle?: string | null;
  chapterStory?: string | null;
  chapterIntro?: string | null;
  chapterSummary?: string | null;
  slideshowCaption?: string | null;
  photoStartIndex: number;
  photoEndIndex: number;
  createdAt: string;
}
