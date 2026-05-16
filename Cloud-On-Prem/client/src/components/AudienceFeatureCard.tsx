import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AudienceData } from "@/config/landingPageData";

interface AudienceFeatureCardProps {
  audience: AudienceData;
  index?: number;
  className?: string;
}

export function AudienceFeatureCard({ 
  audience, 
  index = 0,
  className = "" 
}: AudienceFeatureCardProps) {
  const IconComponent = audience.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ 
        delay: index * 0.1, 
        duration: 0.5,
        ease: "easeOut"
      }}
      className={className}
      data-testid={`audience-card-${audience.id}`}
    >
      <Card 
        className="h-full bg-card/50 backdrop-blur-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card-hover group"
        role="article"
        aria-labelledby={`audience-title-${audience.id}`}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <motion.div 
              className="flex items-center justify-center w-14 h-14 rounded-xl bg-surface-raised border border-primary/30 transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <IconComponent 
                className="w-7 h-7 text-primary/80 group-hover:text-primary/90 transition-colors" 
                aria-hidden="true"
              />
            </motion.div>
            <div>
              <CardTitle 
                id={`audience-title-${audience.id}`}
                className="text-xl sm:text-2xl font-bold group-hover:text-primary/95 transition-colors"
                style={{ color: 'var(--fg-strong)' }}
              >
                {audience.label}
              </CardTitle>
              <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
                {audience.heroTagline}
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <ul 
            className="space-y-3"
            role="list"
            aria-label={`Features for ${audience.label}`}
          >
            {audience.features.map((feature, featureIndex) => (
              <motion.li 
                key={featureIndex}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ 
                  delay: (index * 0.1) + (featureIndex * 0.05) + 0.2,
                  duration: 0.3 
                }}
                className="flex items-start gap-3"
                data-testid={`feature-${audience.id}-${featureIndex}`}
              >
                <span 
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-success/20 border border-[var(--success)]/30 mt-0.5"
                  aria-hidden="true"
                >
                  <Check className="w-3 h-3 text-success" />
                </span>
                <span className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--body-default)' }}>
                  {feature}
                </span>
              </motion.li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface AudienceFeatureGridProps {
  audiences: AudienceData[];
  className?: string;
}

export function AudienceFeatureGrid({ 
  audiences, 
  className = "" 
}: AudienceFeatureGridProps) {
  return (
    <div 
      className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 ${className}`}
      role="region"
      aria-label="Our target audiences"
    >
      {audiences.map((audience, index) => (
        <AudienceFeatureCard 
          key={audience.id}
          audience={audience}
          index={index}
        />
      ))}
    </div>
  );
}
