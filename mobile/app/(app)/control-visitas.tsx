import { View, Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';

// TODO: Roadmap stub — port from web 'src/app/(app)/control-visitas/page.tsx'.
// See docs/mobile-port/ROADMAP.md for the build plan of this area.
export default function ControlVisitas() {
  return (
    <Screen>
      <View className="px-5 pt-6">
        <Text className="text-2xl font-bold text-foreground mb-6">Control de Visitas</Text>
        <LiquidGlass radius={24} className="rounded-3xl p-6">
          <Text className="text-lg font-semibold text-foreground mb-2">Próximamente</Text>
          <Text className="text-base text-muted-foreground">
            Esta sección está en construcción.
          </Text>
        </LiquidGlass>
      </View>
    </Screen>
  );
}
