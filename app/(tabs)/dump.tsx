import React from 'react';

import { Screen } from '@/components/screen';
import { Stub } from '@/components/stub';

export default function Dump() {
  return (
    <Screen title="Dump">
      <Stub
        phase={2}
        lines={[
          'You learned something out there. Type it in raw, however messy.',
          'It gets parsed, tagged, and filed. Under 30 seconds.',
        ]}
      />
    </Screen>
  );
}
