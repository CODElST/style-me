import { NativeModule, requireNativeModule } from 'expo';

import type { DescribeLookParams } from './StyleMeAi.types';

declare class StyleMeAi extends NativeModule<{}> {
  isOnDeviceTextModelAvailable(): boolean;
  describeLookAsync(params: DescribeLookParams): Promise<string>;
}

export default requireNativeModule<StyleMeAi>('StyleMeAi');
