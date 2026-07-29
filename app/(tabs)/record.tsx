import React from 'react';

import { Screen } from '@/components/screen';
import { Stub } from '@/components/stub';

export default function Record() {
  return (
    <Screen title="Record">
      <Stub
        phase={2}
        lines={[
          'Hours counted forever. Day N of 1825.',
          'One line per session about what you learned — the log you will reread in 2031.',
        ]}
      />
    </Screen>
  );
}
