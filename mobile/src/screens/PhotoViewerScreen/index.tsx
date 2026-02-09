import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';

import { PhotoViewer } from '@/components/photo/PhotoViewer';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';

export function PhotoViewerScreen() {
  const navigation = useNavigation();
  const { photos, initialIndex, clearSession } = usePhotoViewerStore();

  const onBack = useCallback(() => {
    clearSession();
    navigation.goBack();
  }, [clearSession, navigation]);

  return <PhotoViewer photos={photos} initialIndex={initialIndex} onBack={onBack} />;
}
