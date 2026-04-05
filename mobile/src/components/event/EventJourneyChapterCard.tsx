import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PhotoGrid } from '@/components/photo/PhotoGrid';
import { JourneyPalette } from '@/styles/colors';
import type { EventChapter } from '@/types/chapter';
import type { EventPhotoItem } from '@/types/event';
import { getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';

type EventJourneyChapterCardProps = {
  chapter: EventChapter;
  photos: EventPhotoItem[];
  teaserText: string;
  descriptionText?: string | null;
  expanded: boolean;
  onToggle: () => void;
  onPhotoPress: (photo: EventPhotoItem, index: number) => void;
};

function ChapterPreviewCollage({ photos }: { photos: EventPhotoItem[] }) {
  const previewPhotos = useMemo(() => photos.slice(0, 3), [photos]);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});

  const renderImage = (photo?: EventPhotoItem, style?: object, label?: string) => {
    const uri = photo && !failedIds[photo.id] ? getPreferredPhotoThumbnailUri(photo) : null;

    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={style}
          resizeMode="cover"
          onError={() => {
            if (photo) {
              setFailedIds((prev) => ({ ...prev, [photo.id]: true }));
            }
          }}
        />
      );
    }

    return (
      <View style={[styles.previewImage, styles.previewFallback, style]}>
        <MaterialCommunityIcons name="image-outline" size={18} color={JourneyPalette.muted} />
        {label ? <Text style={styles.previewFallbackText}>{label}</Text> : null}
      </View>
    );
  };

  if (previewPhotos.length === 0) {
    return (
      <View style={[styles.previewWrap, styles.previewWrapEmpty]}>
        <MaterialCommunityIcons
          name="image-multiple-outline"
          size={20}
          color={JourneyPalette.muted}
        />
        <Text style={styles.previewFallbackText}>暂无图片</Text>
      </View>
    );
  }

  if (previewPhotos.length === 1) {
    return (
      <View style={styles.previewWrap}>{renderImage(previewPhotos[0], styles.singlePreview)}</View>
    );
  }

  return (
    <View style={styles.previewWrap}>
      {renderImage(previewPhotos[0], styles.previewLead)}
      <View style={styles.previewStack}>
        {renderImage(previewPhotos[1], styles.previewStackItem)}
        {renderImage(
          previewPhotos[2],
          styles.previewStackItem,
          `+${Math.max(0, photos.length - 2)}`,
        )}
      </View>
    </View>
  );
}

function EventJourneyChapterCardBase({
  chapter,
  photos,
  teaserText,
  descriptionText,
  expanded,
  onToggle,
  onPhotoPress,
}: EventJourneyChapterCardProps) {
  const title = chapter.chapterTitle?.trim() || `第 ${chapter.chapterIndex} 章`;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.headerPressable, pressed && styles.pressed]}
      >
        <View style={styles.previewCell}>
          <ChapterPreviewCollage photos={photos} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>第 {chapter.chapterIndex} 段</Text>
          <Text style={styles.title}>{title}</Text>
          <Text numberOfLines={2} style={styles.teaser}>
            {teaserText}
          </Text>
          <View style={styles.footerRow}>
            <Text style={styles.photoMeta}>{photos.length} 张照片</Text>
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={JourneyPalette.inkSoft}
            />
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandedContent}>
          {descriptionText ? <Text style={styles.description}>{descriptionText}</Text> : null}
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
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    overflow: 'hidden',
    paddingVertical: 16,
  },
  headerPressable: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  previewCell: {
    width: 140,
  },
  headerCopy: {
    flex: 1,
    gap: 8,
    paddingTop: 4,
  },
  eyebrow: {
    color: JourneyPalette.mutedStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: JourneyPalette.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  teaser: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  footerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  photoMeta: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewWrap: {
    height: 120,
    flexDirection: 'row',
    gap: 6,
  },
  previewWrapEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
    borderRadius: 24,
  },
  singlePreview: {
    width: '100%',
    borderRadius: 24,
  },
  previewLead: {
    flex: 1.2,
    borderRadius: 20,
  },
  previewStack: {
    flex: 0.8,
    gap: 6,
  },
  previewStackItem: {
    flex: 1,
    borderRadius: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: JourneyPalette.cardMuted,
  },
  previewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewFallbackText: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  expandedContent: {
    borderTopWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
    gap: 20,
  },
  description: {
    color: JourneyPalette.inkSoft,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.8,
  },
});

export const EventJourneyChapterCard = memo(EventJourneyChapterCardBase);
