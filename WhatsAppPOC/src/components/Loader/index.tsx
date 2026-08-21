import React from 'react';
import { View, ActivityIndicator, StyleSheet, ActivityIndicatorProps } from 'react-native';
import { useTheme } from '../../theme';

interface LoaderProps extends ActivityIndicatorProps {
  fullScreen?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({
  fullScreen = false,
  size = 'large',
  ...props
}) => {
  const { theme } = useTheme();

  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: theme.background }]}>
        <ActivityIndicator size={size} color={theme.primary} {...props} />
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <ActivityIndicator size={size} color={theme.primary} {...props} />
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  inline: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
