import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail, EventRecord } from '@/types/event';

type EventEditSheetProps = {
  visible: boolean;
  event:
    | Pick<EventRecord, 'id' | 'title' | 'locationName'>
    | Pick<EventDetail, 'id' | 'title' | 'locationName'>
    | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export function EventEditSheet({
  visible,
  event,
  onClose,
  onSaved,
  onDeleted,
}: EventEditSheetProps) {
  const [editTitle, setEditTitle] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!event || !visible) {
      return;
    }
    setEditTitle(event.title ?? '');
    setEditLocationName(event.locationName ?? '');
  }, [event, visible]);

  const handleClose = () => {
    if (isSaving) {
      return;
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={isSaving} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalCopy}>
              <Text style={styles.modalTitle}>编辑事件</Text>
              <Text style={styles.modalHint}>
                标题不会再被后续 AI 自动覆盖；地点修改会触发故事刷新。
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
            >
              <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
            </Pressable>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>事件标题</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="给这段旅程起个名字"
              placeholderTextColor={JourneyPalette.muted}
              style={styles.fieldInput}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>地点</Text>
            <TextInput
              value={editLocationName}
              onChangeText={setEditLocationName}
              placeholder="例如：杭州西湖"
              placeholderTextColor={JourneyPalette.muted}
              style={styles.fieldInput}
            />
          </View>

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => {
                if (!event) {
                  return;
                }
                Alert.alert(
                  '删除事件',
                  '删除后，本事件照片会回到“无事件”状态，现有故事也会移除。',
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '删除',
                      style: 'destructive',
                      onPress: () => {
                        void (async () => {
                          try {
                            await eventApi.deleteEvent(event.id);
                            onDeleted();
                          } catch (error) {
                            Alert.alert(
                              '删除失败',
                              error instanceof Error ? error.message : '请稍后再试',
                            );
                          }
                        })();
                      },
                    },
                  ],
                );
              }}
              style={({ pressed }) => [styles.modalDangerBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalDangerBtnText}>删除事件</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!event) {
                  return;
                }
                void (async () => {
                  try {
                    setIsSaving(true);
                    await eventApi.updateEvent(event.id, {
                      title: editTitle.trim(),
                      locationName: editLocationName.trim(),
                    });
                    onSaved();
                  } catch (error) {
                    Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后再试');
                  } finally {
                    setIsSaving(false);
                  }
                })();
              }}
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF9F2" />
              ) : (
                <Text style={styles.modalPrimaryBtnText}>保存修改</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  modalSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalCopy: {
    flex: 1,
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  modalHint: {
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  formGroup: {
    gap: 8,
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: '#FFF9F2',
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  modalDangerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#F6D9D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerBtnText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
