import React from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  ModalProps,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useTheme } from '../../theme';

interface CustomModalProps extends ModalProps {
  isVisible: boolean;
  onClose?: () => void;
  title?: string;
}

export const Modal: React.FC<CustomModalProps> = ({
  isVisible,
  onClose,
  title,
  children,
  ...props
}) => {
  const { theme } = useTheme();

  return (
    <RNModal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...props}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {title && (
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              {onClose && (
                <TouchableOpacity onPress={onClose}>
                  <Text style={[styles.close, { color: theme.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {children}
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  close: {
    fontSize: 18,
    padding: 4,
  },
});
