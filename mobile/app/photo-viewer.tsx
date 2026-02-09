import { useRouter } from 'expo-router';

import { PhotoViewer } from '@/components/photo/PhotoViewer';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';

export default function PhotoViewerScreen() {
  const router = useRouter();
  const { photos, initialIndex, clearSession } = usePhotoViewerStore();

  return (
    <PhotoViewer
      photos={photos}
      initialIndex={initialIndex}
      onBack={() => {
        clearSession();
        router.back();
      }}
    />
  );
}
