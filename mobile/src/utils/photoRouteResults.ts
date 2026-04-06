type EventPhotoManagerResult = {
  deletedCurrentEvent: boolean;
};

const pendingEventPhotoManagerResults = new Map<string, EventPhotoManagerResult>();
let pendingProfileImportMessage: string | null = null;

export function setEventPhotoManagerResult(eventId: string, result: EventPhotoManagerResult) {
  pendingEventPhotoManagerResults.set(eventId, result);
}

export function consumeEventPhotoManagerResult(eventId: string): EventPhotoManagerResult | null {
  const result = pendingEventPhotoManagerResults.get(eventId) ?? null;
  if (result) {
    pendingEventPhotoManagerResults.delete(eventId);
  }
  return result;
}

export function setPendingProfileImportMessage(message: string) {
  pendingProfileImportMessage = message;
}

export function consumePendingProfileImportMessage(): string | null {
  const message = pendingProfileImportMessage;
  pendingProfileImportMessage = null;
  return message;
}
