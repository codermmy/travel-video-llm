import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';

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
};

export function PageContent({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, style]}>
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
  const toneStyle = buttonTones[tone];

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
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={toneStyle.text.color} /> : null}
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
      <View style={styles.sheetBody}>{children}</View>
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

export function MetricPill({ value, label }: MetricPillProps) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const buttonTones = {
  primary: StyleSheet.create({
    container: {
      backgroundColor: JourneyPalette.accent,
      borderColor: JourneyPalette.accent,
    },
    text: {
      color: '#FFFFFF',
    },
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: JourneyPalette.cardAlt,
      borderColor: JourneyPalette.line,
      borderWidth: 1,
    },
    text: {
      color: JourneyPalette.ink,
    },
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: JourneyPalette.dangerSoft,
      borderColor: JourneyPalette.dangerSoft,
    },
    text: {
      color: JourneyPalette.danger,
    },
  }),
} as const;

const bannerTones = {
  accent: {
    container: {
      backgroundColor: JourneyPalette.accentSoft,
      borderColor: '#D6E3FF',
    },
    iconWrap: {
      backgroundColor: '#FFFFFF',
    },
    iconColor: JourneyPalette.accent,
  },
  warm: {
    container: {
      backgroundColor: JourneyPalette.accentWarmSoft,
      borderColor: '#FFD7C9',
    },
    iconWrap: {
      backgroundColor: '#FFFFFF',
    },
    iconColor: JourneyPalette.accentWarm,
  },
  danger: {
    container: {
      backgroundColor: JourneyPalette.dangerSoft,
      borderColor: '#F6D2C9',
    },
    iconWrap: {
      backgroundColor: '#FFFFFF',
    },
    iconColor: JourneyPalette.danger,
  },
  neutral: {
    container: {
      backgroundColor: JourneyPalette.cardAlt,
      borderColor: JourneyPalette.line,
    },
    iconWrap: {
      backgroundColor: '#FFFFFF',
    },
    iconColor: JourneyPalette.inkSoft,
  },
} as const;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  pageContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
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
    paddingTop: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
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
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: JourneyPalette.inkSoft,
  },
  surfaceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    padding: 16,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 26,
    elevation: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCopy: {
    flex: 1,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  bannerBody: {
    fontSize: 12,
    lineHeight: 18,
    color: JourneyPalette.inkSoft,
  },
  bannerAction: {
    alignSelf: 'center',
  },
  buttonBase: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonAutoWidth: {
    alignSelf: 'flex-start',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 14,
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
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
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
    width: 54,
    height: 54,
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
    minHeight: 76,
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: JourneyPalette.inkSoft,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.5,
  },
});
