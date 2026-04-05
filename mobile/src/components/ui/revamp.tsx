import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import { getJourneyStateAppearance, type JourneyStateKind } from '@/utils/statusLanguage';

export type StatusTone = 'ready' | 'analyzing' | 'importing' | 'stale' | 'failed' | 'neutral';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  rightSlot?: ReactNode;
};

type SectionLabelProps = {
  title: string;
  action?: ReactNode;
};

type SurfaceCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type InlineBannerProps = {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  tone?: 'accent' | 'warm' | 'danger' | 'neutral';
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type ButtonTone = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
};

type BottomSheetScaffoldProps = {
  title: string;
  hint?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
};

type EmptyStateCardProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type MetricPillProps = {
  value: string;
  label: string;
  tone?: StatusTone;
  style?: StyleProp<ViewStyle>;
};

type StatusPillProps = {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

type StateChipProps = {
  state: JourneyStateKind | StatusTone;
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

type FilterChipProps = {
  label: string;
  count?: number | string;
  active?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

type ListItemRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  meta?: string;
  metaTone?: StatusTone;
  onPress?: () => void;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
};

const statusToneMap: Record<
  StatusTone,
  {
    borderColor: string;
    backgroundColor: string;
    textColor: string;
    iconColor: string;
  }
> = {
  ready: {
    borderColor: JourneyPalette.successBorder,
    backgroundColor: JourneyPalette.successSoft,
    textColor: JourneyPalette.success,
    iconColor: JourneyPalette.success,
  },
  analyzing: {
    borderColor: '#CADAFF',
    backgroundColor: JourneyPalette.accentSoft,
    textColor: JourneyPalette.accent,
    iconColor: JourneyPalette.accent,
  },
  importing: {
    borderColor: '#FFD3C1',
    backgroundColor: JourneyPalette.accentWarmSoft,
    textColor: JourneyPalette.accentWarm,
    iconColor: JourneyPalette.accentWarm,
  },
  stale: {
    borderColor: JourneyPalette.warningBorder,
    backgroundColor: JourneyPalette.warningSoft,
    textColor: JourneyPalette.warning,
    iconColor: JourneyPalette.warning,
  },
  failed: {
    borderColor: JourneyPalette.dangerBorder,
    backgroundColor: JourneyPalette.dangerSoft,
    textColor: JourneyPalette.danger,
    iconColor: JourneyPalette.danger,
  },
  neutral: {
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    textColor: JourneyPalette.inkSoft,
    iconColor: JourneyPalette.inkSoft,
  },
};

const buttonToneMap: Record<
  ButtonTone,
  {
    container: ViewStyle;
    text: TextStyle;
    iconColor: string;
  }
> = {
  primary: {
    container: {
      backgroundColor: JourneyPalette.accent,
      borderColor: JourneyPalette.accent,
    },
    text: {
      color: JourneyPalette.white,
    },
    iconColor: JourneyPalette.white,
  },
  secondary: {
    container: {
      backgroundColor: JourneyPalette.card,
      borderColor: JourneyPalette.line,
      borderWidth: 1,
    },
    text: {
      color: JourneyPalette.ink,
    },
    iconColor: JourneyPalette.ink,
  },
  danger: {
    container: {
      backgroundColor: JourneyPalette.dangerSoft,
      borderColor: JourneyPalette.dangerBorder,
      borderWidth: 1,
    },
    text: {
      color: JourneyPalette.danger,
    },
    iconColor: JourneyPalette.danger,
  },
};

const bannerTones = {
  accent: {
    container: {
      backgroundColor: JourneyPalette.accentSoft,
      borderColor: '#D6E3FF',
    },
    iconWrap: {
      backgroundColor: JourneyPalette.white,
    },
    iconColor: JourneyPalette.accent,
  },
  warm: {
    container: {
      backgroundColor: JourneyPalette.accentWarmSoft,
      borderColor: '#FFD7C9',
    },
    iconWrap: {
      backgroundColor: JourneyPalette.white,
    },
    iconColor: JourneyPalette.accentWarm,
  },
  danger: {
    container: {
      backgroundColor: JourneyPalette.dangerSoft,
      borderColor: JourneyPalette.dangerBorder,
    },
    iconWrap: {
      backgroundColor: JourneyPalette.white,
    },
    iconColor: JourneyPalette.danger,
  },
  neutral: {
    container: {
      backgroundColor: JourneyPalette.cardMuted,
      borderColor: JourneyPalette.line,
    },
    iconWrap: {
      backgroundColor: JourneyPalette.white,
    },
    iconColor: JourneyPalette.inkSoft,
  },
} as const;

export function getStatusToneColors(tone: StatusTone) {
  return statusToneMap[tone];
}

export function PageContent({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.pageContent, style]}
    >
      {children}
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, eyebrow, rightSlot }: PageHeaderProps) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightSlot ? <View style={styles.pageHeaderAction}>{rightSlot}</View> : null}
    </View>
  );
}

export function SectionLabel({ title, action }: SectionLabelProps) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

export function SurfaceCard({ children, style }: SurfaceCardProps) {
  return <View style={[styles.surfaceCard, style]}>{children}</View>;
}

export function InlineBanner({
  icon = 'information-outline',
  title,
  body,
  tone = 'accent',
  action,
  style,
}: InlineBannerProps) {
  const toneStyle = bannerTones[tone];

  return (
    <View style={[styles.banner, toneStyle.container, style]}>
      <View style={[styles.bannerIconWrap, toneStyle.iconWrap]}>
        <MaterialCommunityIcons name={icon} size={18} color={toneStyle.iconColor} />
      </View>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      {action ? <View style={styles.bannerAction}>{action}</View> : null}
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral', icon, style }: StatusPillProps) {
  const toneStyle = statusToneMap[tone];

  return (
    <View
      style={[
        styles.statusPill,
        {
          borderColor: toneStyle.borderColor,
          backgroundColor: toneStyle.backgroundColor,
        },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={13} color={toneStyle.iconColor} /> : null}
      <Text style={[styles.statusPillText, { color: toneStyle.textColor }]}>{label}</Text>
    </View>
  );
}

export function StateChip({ state, label, compact = false, style }: StateChipProps) {
  const normalizedState =
    state === 'analyzing' ? 'processing' : state === 'neutral' ? 'importing' : state;
  const appearance = getJourneyStateAppearance(normalizedState);

  return (
    <StatusPill
      label={label || (compact ? appearance.shortLabel : appearance.label)}
      tone={normalizedState === 'processing' ? 'analyzing' : normalizedState}
      icon={appearance.icon}
      style={[compact && styles.stateChipCompact, style]}
    />
  );
}

export function FilterChip({ label, count, active = false, onPress, style }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.filterCountBadge, active && styles.filterCountBadgeActive]}>
          <Text style={[styles.filterCountBadgeText, active && styles.filterCountBadgeTextActive]}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ListItemRow({
  icon,
  title,
  subtitle,
  meta,
  metaTone = 'neutral',
  onPress,
  destructive = false,
  style,
}: ListItemRowProps) {
  const metaColors = statusToneMap[metaTone];

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listItemRow,
        pressed && onPress ? styles.pressedRow : null,
        style,
      ]}
    >
      <View
        style={[
          styles.listItemIconWrap,
          destructive ? styles.listItemDangerIconWrap : styles.listItemAccentIconWrap,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={destructive ? JourneyPalette.danger : JourneyPalette.accent}
        />
      </View>
      <View style={styles.listItemCopy}>
        <Text style={[styles.listItemTitle, destructive && styles.listItemDangerTitle]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.listItemSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.listItemTrailing}>
        {meta ? (
          <View
            style={[
              styles.listItemMetaBadge,
              {
                borderColor: metaColors.borderColor,
                backgroundColor: metaColors.backgroundColor,
              },
            ]}
          >
            <Text style={[styles.listItemMetaText, { color: metaColors.textColor }]}>{meta}</Text>
          </View>
        ) : null}
        {onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  icon,
  fullWidth = true,
  style,
  trailing,
}: ActionButtonProps) {
  const toneStyle = buttonToneMap[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.buttonBase,
        !fullWidth && styles.buttonAutoWidth,
        toneStyle.container,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={toneStyle.iconColor} /> : null}
      <Text style={[styles.buttonText, toneStyle.text]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

export function BottomSheetScaffold({
  title,
  hint,
  onClose,
  children,
  footer,
  style,
  bodyStyle,
}: BottomSheetScaffoldProps) {
  return (
    <View style={[styles.sheet, style]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}>
        <View style={styles.sheetCopy}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {hint ? <Text style={styles.sheetHint}>{hint}</Text> : null}
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.sheetBody, bodyStyle]}>{children}</View>
      {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
    </View>
  );
}

export function EmptyStateCard({ icon, title, description, action, style }: EmptyStateCardProps) {
  return (
    <SurfaceCard style={[styles.emptyCard, style]}>
      <View style={styles.emptyIconWrap}>
        <MaterialCommunityIcons name={icon} size={24} color={JourneyPalette.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </SurfaceCard>
  );
}

export function MetricPill({ value, label, tone = 'neutral', style }: MetricPillProps) {
  const toneStyle = statusToneMap[tone];

  return (
    <View
      style={[
        styles.metricPill,
        {
          borderColor: toneStyle.borderColor,
          backgroundColor: tone === 'neutral' ? JourneyPalette.cardAlt : toneStyle.backgroundColor,
        },
        style,
      ]}
    >
      <Text
        style={[styles.metricValue, tone !== 'neutral' ? { color: toneStyle.textColor } : null]}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  pageContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 18,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  pageHeaderAction: {
    paddingTop: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.9,
    color: JourneyPalette.ink,
  },
  pageSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: JourneyPalette.inkSoft,
  },
  surfaceCard: {
    borderRadius: 32,
    borderWidth: 0,
    backgroundColor: JourneyPalette.card,
    padding: 24,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.03,
    shadowRadius: 24,
    elevation: 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: JourneyPalette.card,
    padding: 16,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
  },
  bannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCopy: {
    flex: 1,
    gap: 4,
    paddingTop: 3,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
    letterSpacing: -0.2,
  },
  bannerBody: {
    fontSize: 14,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  bannerAction: {
    alignSelf: 'center',
  },
  statusPill: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  stateChipCompact: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChipActive: {
    borderColor: JourneyPalette.accent,
    backgroundColor: JourneyPalette.accentSoft,
  },
  filterChipText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: JourneyPalette.accent,
  },
  filterCountBadge: {
    minWidth: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: JourneyPalette.cardMuted,
  },
  filterCountBadgeActive: {
    backgroundColor: JourneyPalette.white,
  },
  filterCountBadgeText: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  filterCountBadgeTextActive: {
    color: JourneyPalette.accent,
  },
  listItemRow: {
    minHeight: 72,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemAccentIconWrap: {
    backgroundColor: JourneyPalette.accentSoft,
  },
  listItemDangerIconWrap: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  listItemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemCopy: {
    flex: 1,
    gap: 4,
  },
  listItemTitle: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  listItemDangerTitle: {
    color: JourneyPalette.danger,
  },
  listItemSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  listItemTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listItemMetaBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  listItemMetaText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonBase: {
    minHeight: 56,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonAutoWidth: {
    alignSelf: 'flex-start',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  sheet: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetCopy: {
    flex: 1,
    gap: 6,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: JourneyPalette.ink,
  },
  sheetHint: {
    fontSize: 13,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  sheetBody: {
    marginTop: 16,
  },
  sheetFooter: {
    marginTop: 16,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accentSoft,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  emptyDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 14,
  },
  metricPill: {
    flex: 1,
    minHeight: 82,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: JourneyPalette.ink,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: JourneyPalette.inkSoft,
  },
  pressedRow: {
    backgroundColor: 'rgba(228, 236, 255, 0.44)',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.5,
  },
});
