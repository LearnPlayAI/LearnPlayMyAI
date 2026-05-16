import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Sparkles, Award } from 'lucide-react';
import { PowerUpsShop } from './PowerUpsShop';
import { CosmeticsShop } from './CosmeticsShop';
import { SeasonPass } from './SeasonPass';

export function UnifiedShop() {
  return (
    <Tabs defaultValue="powerups" className="w-full bg-background text-foreground p-4 rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <TabsList className="flex flex-col h-auto space-y-2 bg-card border border-stroke-default shadow-sm p-4 rounded-lg">
          <TabsTrigger 
            value="powerups"
            className="w-full justify-start"
            data-testid="tab-powerups"
          >
            <Zap className="w-4 h-4 mr-2" />
            Power-Ups
          </TabsTrigger>
          <TabsTrigger 
            value="cosmetics"
            className="w-full justify-start"
            data-testid="tab-cosmetics"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Cosmetics
          </TabsTrigger>
          <TabsTrigger 
            value="seasonpass"
            className="w-full justify-start"
            data-testid="tab-season-pass"
          >
            <Award className="w-4 h-4 mr-2" />
            Season Pass
          </TabsTrigger>
        </TabsList>

        <div className="pr-4">
          <TabsContent value="powerups" className="mt-0">
            <PowerUpsShop />
          </TabsContent>

          <TabsContent value="cosmetics" className="mt-0">
            <CosmeticsShop />
          </TabsContent>

          <TabsContent value="seasonpass" className="mt-0">
            <SeasonPass />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}
