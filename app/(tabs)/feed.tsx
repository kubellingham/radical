import React from 'react';

import { Screen } from '@/components/screen';
import { Stub } from '@/components/stub';

export default function Feed() {
  return (
    <Screen title="Feed">
      <Stub
        phase={3}
        lines={[
          'Four idle minutes, a deck of cards. Right if you have it, left to see it again.',
          'Pick a context — café, class, transit — and the deck matches it.',
        ]}
      />
    </Screen>
  );
}
