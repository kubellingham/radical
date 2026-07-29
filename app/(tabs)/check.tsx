import React from 'react';

import { Screen } from '@/components/screen';
import { Stub } from '@/components/stub';

export default function Check() {
  return (
    <Screen title="Check">
      <Stub
        phase={4}
        lines={[
          'Once a day, two minutes, a short conversation.',
          'It works your due words in naturally and grades quietly in the background.',
        ]}
      />
    </Screen>
  );
}
