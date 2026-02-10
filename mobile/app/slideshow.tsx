import { useRouter } from 'expo-router';

import { SlideshowPlayer } from '@/components/slideshow/SlideshowPlayer';
import { useSlideshowStore } from '@/stores/slideshowStore';

export default function SlideshowScreen() {
  const router = useRouter();
  const { event, photos, clearSession } = useSlideshowStore();

  if (!event) {
    return (
      <SlideshowPlayer
        event={{
          id: 'empty',
          title: '未选择事件',
          musicUrl: null,
          storyText: null,
          fullStory: null,
          chapters: [],
          photoGroups: [],
        }}
        photos={[]}
        onClose={() => {
          clearSession();
          router.back();
        }}
      />
    );
  }

  return (
    <SlideshowPlayer
      event={event}
      photos={photos}
      onClose={() => {
        clearSession();
        router.back();
      }}
    />
  );
}
