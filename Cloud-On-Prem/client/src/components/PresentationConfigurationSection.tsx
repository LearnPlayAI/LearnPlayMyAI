import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ThemeGalleryPanel } from "./ThemeGalleryPanel";
import { ThemePreviewPanel } from "./ThemePreviewPanel";
import { ImageStyleSelector } from "./ImageStyleSelector";
import { UseFormReturn } from "react-hook-form";
import { useLessonCreditCosts } from "@/hooks/useLessonCreditCosts";
import { Textarea } from "@/components/ui/textarea";

interface PresentationConfigurationSectionProps {
  form: UseFormReturn<any>;
  themesData: { themes: Array<{ id: string; name: string; description?: string; thumbnailUrl?: string; categories?: string[] }> } | undefined;
  savedThemeId?: string | null;
  savedImageStyle?: string | null;
}

export function PresentationConfigurationSection({
  form,
  themesData,
  savedThemeId,
  savedImageStyle,
}: PresentationConfigurationSectionProps) {
  const { costs } = useLessonCreditCosts();
  
  const baseMin = costs.creditsPerLessonTextOnlyMin;
  const baseMax = costs.creditsPerLessonTextOnlyMax;
  const imageAddonMin = costs.creditsPerLessonWithImagesMin - costs.creditsPerLessonTextOnlyMin;
  const imageAddonMax = costs.creditsPerLessonWithImagesMax - costs.creditsPerLessonTextOnlyMax;
  const totalWithImagesMin = costs.creditsPerLessonWithImagesMin;
  const totalWithImagesMax = costs.creditsPerLessonWithImagesMax;
  
  return (
    <div className="pt-4 border-t">
      <h4 className="text-sm font-medium mb-3">Presentation Configuration</h4>
      <div className="space-y-6">
        <div>
          <FormLabel className="mb-3 block">Theme Selection</FormLabel>
          <div className="grid grid-cols-1 lg:grid-cols-[60%,40%] gap-4">
            <div className="lg:col-span-1">
              <FormField
                control={form.control}
                name="themeId"
                render={({ field }) => (
                  <FormItem>
                    <ThemeGalleryPanel
                      value={field.value}
                      onChange={(themeId) => form.setValue("themeId", themeId)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="lg:col-span-1">
              <FormField
                control={form.control}
                name="themeId"
                render={({ field }) => (
                  <ThemePreviewPanel
                    theme={themesData?.themes.find((t) => t.id === field.value) || null}
                  />
                )}
              />
            </div>
          </div>
          {savedThemeId && form.watch("themeId") === savedThemeId && (
            <p className="text-xs text-primary mt-2">Using your saved preference</p>
          )}
        </div>

        <FormField
          control={form.control}
          name="generateImages"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">
                  Generate AI Images
                </FormLabel>
                <FormDescription>
                  Include AI-generated images in your presentation. Disabling this will use placeholders and significantly reduce credit costs.
                </FormDescription>
              </div>
              <FormControl>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  className="h-5 w-5 rounded border-border"
                  data-testid="toggle-generate-images"
                />
              </FormControl>
            </FormItem>
          )}
        />

        {form.watch("generateImages") && (
          <FormField
            control={form.control}
            name="imageStyle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image Style</FormLabel>
                <ImageStyleSelector
                  value={field.value}
                  onChange={(styleKey) => form.setValue("imageStyle", styleKey)}
                />
                {savedImageStyle && field.value === savedImageStyle && (
                  <FormDescription>
                    <span className="text-xs text-primary">Using your saved preference</span>
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="additionalInstructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Gamma Instructions</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value || ""}
                  rows={4}
                  maxLength={5000}
                  placeholder="Add optional layout and style guidance for Gamma presentation generation."
                />
              </FormControl>
              <FormDescription>
                Sent directly to Gamma as <code>additionalInstructions</code> (max 5000 chars).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="mt-4 rounded-lg border bg-muted/50 p-4">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span>💳</span> Estimated Credit Cost
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base generation (10 cards):</span>
              <span className="font-medium">{baseMin}–{baseMax} credits</span>
            </div>
            {form.watch("generateImages") && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">AI images (10 cards):</span>
                <span className="font-medium">{imageAddonMin}–{imageAddonMax} credits</span>
              </div>
            )}
            <div className="pt-2 border-t flex justify-between">
              <span className="font-semibold">Total Estimate:</span>
              <span className="font-bold text-lg">
                {form.watch("generateImages") ? `${totalWithImagesMin}–${totalWithImagesMax}` : `${baseMin}–${baseMax}`} credits
              </span>
            </div>
            {!form.watch("generateImages") && (
              <p className="text-xs text-success dark:text-success mt-2">
                ✓ Saving ~{imageAddonMin}–{imageAddonMax} credits by using image placeholders
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
