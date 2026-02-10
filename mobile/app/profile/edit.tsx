import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { userApi } from '@/services/api/userApi';

const NICKNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$/;
const USERNAME_PATTERN = /^[a-z0-9_-]{2,64}$/;

export default function EditProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      const user = await userApi.getCurrentUser();
      setNickname(user.nickname || '');
      setUsername(user.username || '');
    } catch (e) {
      Alert.alert('加载失败', e instanceof Error ? e.message : '请稍后重试');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const nicknameCount = useMemo(() => nickname.trim().length, [nickname]);

  const onSave = useCallback(async () => {
    const cleanNickname = nickname.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanNickname) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    if (!NICKNAME_PATTERN.test(cleanNickname)) {
      Alert.alert('提示', '昵称仅支持中文、英文、数字、下划线和连字符，长度 2-64');
      return;
    }
    if (cleanUsername && !USERNAME_PATTERN.test(cleanUsername)) {
      Alert.alert('提示', '用户名仅支持小写字母、数字、下划线和连字符，长度 2-64');
      return;
    }

    try {
      setSaving(true);
      await userApi.updateCurrentUser({
        nickname: cleanNickname,
        username: cleanUsername || undefined,
      });
      Alert.alert('保存成功', '资料已更新', [{ text: '确定', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [nickname, router, username]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#3659A8" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>编辑资料</Text>

        <View style={styles.card}>
          <Text style={styles.label}>昵称</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="请输入昵称"
            maxLength={64}
          />
          <Text style={styles.hint}>长度 {nicknameCount}/64</Text>

          <Text style={styles.label}>用户名（用于分享/搜索）</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(value) => setUsername(value.toLowerCase())}
            placeholder="可选，如 traveler_01"
            autoCapitalize="none"
            maxLength={64}
          />
          <Text style={styles.hint}>仅支持小写字母、数字、_、-</Text>
        </View>

        <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>保存</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF3FF',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FF',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#22335C',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  label: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#2D406E',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8E1F8',
    backgroundColor: '#F8FAFF',
    fontSize: 14,
    color: '#24355E',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 11,
    color: '#7D91B8',
  },
  saveButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#3659A8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
