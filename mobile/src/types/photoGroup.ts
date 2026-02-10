export interface PhotoGroup {
  id: string;
  chapterId: string;
  groupIndex: number;
  groupTheme?: string | null;
  groupEmotion?: string | null;
  groupSceneDesc?: string | null;
  photoStartIndex: number;
  photoEndIndex: number;
  createdAt: string;
}
