import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PhotoGrid } from '@/components/photo/PhotoGrid';
import { JourneyPalette } from '@/styles/colors';
import type { EventChapter } from '@/types/chapter';
import type { EventPhotoItem } from '@/types/event';
import { getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';

const CHAPTER_TITLE_FALLBACK = '未命名章节';
const CHAPTER_DESCRIPTION_FALLBACK = '这段章节还没有正文描述。';

type EventJourneyChapterCardProps = {
  chapter: EventChapter;
  photos: EventPhotoItem[];
  descriptionText?: string | null;
  expanded: boolean;
  onToggle: () => void;
  onPhotoPress: (photo: EventPhotoItem, index: number) => void;
};

function ChapterThumbnail({ photos }: { photos: EventPhotoItem[] }) {
  const leadPhoto = useMemo(() => photos[0] ?? null, [photos]);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const thumbnailUri =
    leadPhoto && !thumbnailFailed ? getPreferredPhotoThumbnailUri(leadPhoto) : null;

  if (thumbnailUri) {
    return (
      <Image
        source={{ uri: thumbnailUri }}
        style={styles.thumbnailImage}
        resizeMode="cover"
        onError={() => setThumbnailFailed(true)}
      />
    );
  }

  return (
    <View style={styles.thumbnailFallback}>
      <MaterialCommunityIcons name="image-outline" size={22} color={JourneyPalette.muted} />
    </View>
  );
}

function EventJourneyChapterCardBase({
  chapter,
  photos,
  descriptionText,
  expanded,
  onToggle,
  onPhotoPress,
}: EventJourneyChapterCardProps) {
  const title = chapter.chapterTitle?.trim() || CHAPTER_TITLE_FALLBACK;
  const description = descriptionText?.trim() || CHAPTER_DESCRIPTION_FALLBACK;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
      >
        <View style={styles.thumbnailWrap}>
          <ChapterThumbnail photos={photos} />
        </View>

        <View style={styles.copyWrap}>
          <Text numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={3} style={styles.description}>
            {description}
          </Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandedContent}>
          <PhotoGrid
            photos={photos}
            onPhotoPress={onPhotoPress}
            emptyText="这个片段还没有可展示的照片"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 32,
    backgroundColor: JourneyPalette.surfaceVariant,
    padding: 24,
  },
  cardPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  thumbnailWrap: {
    width: 90,
    height: 90,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardMuted,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    flex: 1,
  },
  title: {
    color: JourneyPalette.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  description: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  expandedContent: {
    marginTop: 20,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});

export const EventJourneyChapterCard = memo(EventJourneyChapterCardBase);
