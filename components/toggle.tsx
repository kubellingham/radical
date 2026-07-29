import React from 'react';
import { Platform, Switch } from 'react-native';

import { colors } from '@/constants/theme';

// react-native-web's Switch ignores trackColor.true/thumbColor for the ON
// state and falls back to a teal default — which would be the only non-token
// color in the app. It takes its own activeTrackColor/activeThumbColor props.
const webProps =
  Platform.OS === 'web'
    ? ({ activeTrackColor: colors.slate, activeThumbColor: colors.paper } as object)
    : {};

export function Toggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.rule, true: colors.slate }}
      thumbColor={colors.paper}
      ios_backgroundColor={colors.rule}
      {...webProps}
    />
  );
}
