import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import type { EventChapter } from '@/types/chapter';
import type { EventPhotoItem } from '@/types/event';
import { getPhotoThumbnailCandidates } from '@/utils/mediaRefs';

const CHAPTER_TITLE_FALLBACK = '未命名章节';
const CHAPTER_SUMMARY_FALLBACK = '这段章节还没有摘要。';
const CHAPTER_BODY_FALLBACK = '这段章节还没有正文描述。';

type EventJourneyChapterCardProps = {
  chapter: EventChapter;
  chapterNumber: number;
  photos: EventPhotoItem[];
  summaryText?: string | null;
  bodyText?: string | null;
  expanded: boolean;
  onToggle: () => void;
  onPhotoPress: (photo: EventPhotoItem, index: number) => void;
};

function splitParagraphs(text?: string | null): string[] {
  return (text || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

function ChapterPhotoTile({
  photo,
  index,
  width,
  aspectRatio,
  borderRadius,
  onPhotoPress,
}: {
  photo?: EventPhotoItem;
  index: number;
  width?: number;
  aspectRatio: number;
  borderRadius: number;
  onPhotoPress: (photo: EventPhotoItem, index: number) => void;
}) {
  const [failedCandidateIndex, setFailedCandidateIndex] = useState(0);
  const uri = photo ? (getPhotoThumbnailCandidates(photo)[failedCandidateIndex] ?? null) : null;

  return (
    <Pressable
      disabled={!photo || !uri}
      onPress={() => {
        if (photo) {
          onPhotoPress(photo, index);
        }
      }}
      style={({ pressed }) => [
        styles.photoTile,
        { width, aspectRatio, borderRadius },
        pressed && photo && uri && styles.pressed,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.photoTileImage}
          resizeMode="cover"
          onError={() => setFailedCandidateIndex((previous) => previous + 1)}
        />
      ) : (
        <View style={styles.photoTileFallback}>
          <MaterialCommunityIcons name="image-outline" size={20} color={JourneyPalette.muted} />
        </View>
      )}
    </Pressable>
  );
}

function EventJourneyChapterCardBase({
  chapter,
  chapterNumber,
  photos,
  summaryText,
  bodyText,
  expanded,
  onToggle,
  onPhotoPress,
}: EventJourneyChapterCardProps) {
  const { width } = useWindowDimensions();
  const title = chapter.chapterTitle?.trim() || CHAPTER_TITLE_FALLBACK;
  const summary = summaryText?.trim() || CHAPTER_SUMMARY_FALLBACK;
  const body = bodyText?.trim() || CHAPTER_BODY_FALLBACK;
  const paragraphs = useMemo(() => splitParagraphs(body), [body]);
  const foldedPhotos = useMemo(
    () => Array.from({ length: 3 }, (_value, index) => photos[index]),
    [photos],
  );
  const expandedPhotoSize = useMemo(() => Math.floor((width - 48 - 44 - 20) / 3), [width]);

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <View style={[styles.headerRow, expanded && styles.headerRowExpanded]}>
        <Pressable
          onPress={onToggle}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.pressed]}
        >
          <View style={styles.chapterIndex}>
            <Text style={styles.chapterIndexText}>{String(chapterNumber).padStart(2, '0')}</Text>
          </View>

          <View style={styles.headingCopy}>
            <Text numberOfLines={2} style={[styles.title, expanded && styles.titleExpanded]}>
              {title}
            </Text>
            {!expanded ? (
              <Text numberOfLines={2} style={styles.summary}>
                {summary}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? '收起章节' : '展开章节'}
          onPress={onToggle}
          style={({ pressed }) => [styles.toggleButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name="chevron-down"
            size={20}
            color={JourneyPalette.ink}
            style={expanded ? styles.toggleIconOpen : null}
          />
        </Pressable>
      </View>

      {!expanded ? (
        <View style={styles.foldedMediaRow}>
          {foldedPhotos.map((photo, index) => (
            <View key={photo?.id ?? `chapter-photo-slot-${index}`} style={styles.foldedPhotoSlot}>
              <ChapterPhotoTile
                photo={photo}
                index={index}
                aspectRatio={1}
                borderRadius={16}
                onPhotoPress={onPhotoPress}
              />
            </View>
          ))}
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.expandedContent}>
          {paragraphs.map((paragraph, index) => (
            <Text
              key={`${paragraph.slice(0, 24)}-${index}`}
              style={[styles.body, index > 0 && styles.bodyParagraph]}
            >
              {paragraph}
            </Text>
          ))}

          {photos.length > 0 ? (
            <View style={styles.expandedGrid}>
              {photos.map((photo, index) => (
                <ChapterPhotoTile
                  key={photo.id}
                  photo={photo}
                  index={index}
                  width={expandedPhotoSize}
                  aspectRatio={1.05}
                  borderRadius={16}
                  onPhotoPress={onPhotoPress}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 22,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    boxShadow: '0px 20px 40px rgba(15, 23, 42, 0.08)',
  },
  cardExpanded: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  headerRowExpanded: {
    marginBottom: 8,
  },
  headerPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  chapterIndex: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  chapterIndexText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headingCopy: {
    flex: 1,
  },
  title: {
    marginBottom: 8,
    color: JourneyPalette.ink,
    fontSize: 21,
    lineHeight: 23,
    letterSpacing: -0.8,
    fontWeight: '900',
  },
  titleExpanded: {
    marginBottom: 0,
  },
  summary: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 26,
    fontWeight: '500',
  },
  toggleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 12px 22px rgba(15, 23, 42, 0.06)',
  },
  toggleIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  foldedMediaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  foldedPhotoSlot: {
    flex: 1,
  },
  expandedContent: {
    marginTop: 0,
  },
  body: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 26,
    fontWeight: '500',
  },
  bodyParagraph: {
    marginTop: 14,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  photoTile: {
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardSoft,
  },
  photoTileImage: {
    width: '100%',
    height: '100%',
  },
  photoTileFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardMuted,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});

export const EventJourneyChapterCard = memo(EventJourneyChapterCardBase);
