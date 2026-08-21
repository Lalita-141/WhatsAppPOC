import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../core/theme';

export type TabType = 'chats' | 'updates' | 'communities' | 'calls';

interface TabItemConfig {
  key: TabType;
  label: string;
  icon: string;
  badgeCount?: number;
}

const TAB_CONFIGS: TabItemConfig[] = [
  { key: 'chats', label: 'Chats', icon: '💬' },
  { key: 'updates', label: 'Updates', icon: '🔄' },
  { key: 'communities', label: 'Communities', icon: '👥' },
  { key: 'calls', label: 'Calls', icon: '📞' },
];

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  unreadChatsCount?: number;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = React.memo(({
  activeTab,
  onTabChange,
  unreadChatsCount,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      {TAB_CONFIGS.map((tab) => {
        const isActive = activeTab === tab.key;
        const color = isActive ? theme.primary : theme.textSecondary;
        const count = tab.key === 'chats' ? unreadChatsCount : tab.badgeCount;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            {/* Icon Container with WhatsApp Pill for active tab */}
            <View style={[styles.iconContainer, isActive && { backgroundColor: `${theme.primary}1A` }]}>
              <Text style={[styles.tabIcon, { color }]}>{tab.icon}</Text>
              {Boolean(count && count > 0) && (
                <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.badgeText}>{count! > 99 ? '99+' : count}</Text>
                </View>
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                styles.tabLabel,
                {
                  color,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    height: 60,
    borderTopWidth: 1,
    paddingBottom: 4,
    paddingTop: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
