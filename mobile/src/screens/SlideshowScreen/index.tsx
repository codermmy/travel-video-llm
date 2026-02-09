import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';

import { SlideshowPlayer } from '@/components/slideshow/SlideshowPlayer';
import { useSlideshowStore } from '@/stores/slideshowStore';

export function SlideshowScreen() {
  const navigation = useNavigation();
  const { event, photos, clearSession } = useSlideshowStore();

  const onClose = useCallback(() => {
    clearSession();
    navigation.goBack();
  }, [clearSession, navigation]);

  if (!event) {
    return (
      <SlideshowPlayer
        event={{ id: 'empty', title: '未选择事件', musicUrl: null, storyText: null }}
        photos={[]}
        onClose={onClose}
      />
    );
  }

  return <SlideshowPlayer event={event} photos={photos} onClose={onClose} />;
}
