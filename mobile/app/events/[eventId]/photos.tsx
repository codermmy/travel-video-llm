import { useLocalSearchParams, useRouter } from 'expo-router';

import { EventPhotoManagerScreen } from '@/components/event/EventPhotoManagerSheet';
import { setEventPhotoManagerResult } from '@/utils/photoRouteResults';

export default function EventPhotoManagerRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  return (
    <EventPhotoManagerScreen
      eventId={eventId ?? null}
      onClose={() => router.back()}
      onChanged={({ deletedCurrentEvent }) => {
        if (!eventId) {
          router.back();
          return;
        }

        setEventPhotoManagerResult(eventId, { deletedCurrentEvent });
        router.back();
      }}
    />
  );
}
