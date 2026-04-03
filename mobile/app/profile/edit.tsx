import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  ActionButton,
  EmptyStateCard,
  ListItemRow,
  PageContent,
  PageHeader,
  SectionLabel,
  SurfaceCard,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import { userApi, type UserProfile } from '@/services/api/userApi';

const NICKNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const user = await userApi.getCurrentUser();
      setCurrentUser(user);
      setNickname(user.nickname || '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const nicknameCount = useMemo(() => nickname.trim().length, [nickname]);

  const onSave = useCallback(async () => {
    const cleanNickname = nickname.trim();

    if (!cleanNickname) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    if (!NICKNAME_PATTERN.test(cleanNickname)) {
      Alert.alert('提示', '昵称仅支持中文、英文、数字、下划线和连字符，长度 2-64');
      return;
    }

    try {
      setSaving(true);
      await userApi.updateCurrentUser({ nickname: cleanNickname });
      Alert.alert('保存成功', '本机展示名称已更新', [
        { text: '确定', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [nickname, router]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorWrap}>
        <EmptyStateCard
          icon="account-edit-outline"
          title="本机资料加载失败"
          description={loadError}
          action={<ActionButton label="重试" onPress={() => void loadUser()} fullWidth={false} />}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <PageContent>
        <PageHeader
          title="本机资料"
          subtitle="低频页也保持同一套分组、边框、留白和动作层级。"
          rightSlot={
            <ActionButton
              label="返回"
              tone="secondary"
              icon="arrow-left"
              fullWidth={false}
              onPress={() => router.back()}
            />
          }
        />

        <SurfaceCard>
          <SectionLabel title="资料概览" />
          <View style={styles.profileSummary}>
            {currentUser?.avatar_url ? (
              <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {(nickname.trim() || 'D').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileSummaryCopy}>
              <Text style={styles.profileSummaryTitle}>本机资料</Text>
              <Text style={styles.profileSummaryBody}>
                昵称、头像和轻展示信息保持同一风格，不拆成独立心智。
              </Text>
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <SectionLabel title="基本资料" />
          <Text style={styles.cardTitle}>编辑昵称</Text>
          <Text style={styles.cardHint}>这里只保留轻量展示信息，不涉及账号升级或社交资料。</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>昵称</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="请输入昵称"
              maxLength={64}
              placeholderTextColor={JourneyPalette.muted}
            />
            <Text style={styles.hint}>长度 {nicknameCount}/64</Text>
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <SectionLabel title="头像来源" />
          <View style={styles.sourceGrid}>
            <View style={styles.sourceMetric}>
              <Text style={styles.sourceMetricTitle}>相册选择</Text>
              <Text style={styles.sourceMetricBody}>允许裁切和预览，优先保持低步骤和确定感。</Text>
            </View>
            <View style={styles.sourceMetric}>
              <Text style={styles.sourceMetricTitle}>拍照更新</Text>
              <Text style={styles.sourceMetricBody}>
                和相册入口并列，但确认动作统一回到头像页完成。
              </Text>
            </View>
          </View>
          <ListItemRow
            icon="account-circle-outline"
            title="上传头像"
            subtitle="确认动作回到底部主按钮，系统会更新当前设备头像。"
            meta="确认"
            onPress={() => router.push('/profile/avatar')}
            style={styles.avatarRow}
          />
        </SurfaceCard>

        <ActionButton label="保存修改" onPress={onSave} disabled={saving} />
      </PageContent>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: JourneyPalette.cardAlt,
  },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  avatarFallbackText: {
    color: JourneyPalette.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  profileSummaryCopy: {
    flex: 1,
    gap: 4,
  },
  profileSummaryTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  profileSummaryBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  cardTitle: {
    marginTop: 12,
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  cardHint: {
    marginTop: 6,
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  fieldGroup: {
    marginTop: 16,
    gap: 8,
  },
  fieldLabel: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
    fontSize: 14,
  },
  hint: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  avatarRow: {
    marginTop: 8,
  },
  sourceGrid: {
    gap: 10,
    marginTop: 6,
  },
  sourceMetric: {
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  sourceMetricTitle: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  sourceMetricBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
});
