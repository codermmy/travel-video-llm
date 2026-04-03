import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  PageContent,
  PageHeader,
  SectionLabel,
  SurfaceCard,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import { userApi } from '@/services/api/userApi';

const NICKNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$/;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const user = await userApi.getCurrentUser();
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
          subtitle="低频页也保持和主页面同一套分组、边框、留白和按钮体系。"
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
});
