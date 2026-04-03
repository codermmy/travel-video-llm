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
    borderRadius: 22,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    overflow: 'hidden',
  },
  headerPressable: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
  },
  previewCell: {
    width: 118,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: JourneyPalette.mutedStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  teaser: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  footerRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  photoMeta: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  previewWrap: {
    height: 94,
    flexDirection: 'row',
    gap: 6,
  },
  previewWrapEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    borderRadius: 18,
  },
  singlePreview: {
    width: '100%',
    borderRadius: 16,
  },
  previewLead: {
    flex: 1.15,
    borderRadius: 16,
  },
  previewStack: {
    flex: 0.85,
    gap: 6,
  },
  previewStackItem: {
    flex: 1,
    borderRadius: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E1D8',
  },
  previewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewFallbackText: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: JourneyPalette.line,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  description: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.94,
  },
});

export const EventJourneyChapterCard = memo(EventJourneyChapterCardBase);
