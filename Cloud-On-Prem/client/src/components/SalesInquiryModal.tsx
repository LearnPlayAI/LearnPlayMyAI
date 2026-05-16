import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertSalesInquirySchema } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useBrandingLogo } from '@/contexts/BrandingContext';

type SalesInquiryFormData = z.infer<typeof insertSalesInquirySchema>;

interface SalesInquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesInquiryModal({ open, onOpenChange }: SalesInquiryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orgName } = useBrandingLogo();

  const form = useForm<SalesInquiryFormData>({
    resolver: zodResolver(insertSalesInquirySchema),
    defaultValues: {
      name: "",
      surname: "",
      email: "",
      phone: "",
      organizationName: "",
      position: "",
      positionOther: "",
      studentCount: "",
      hearAboutUs: "",
      hearAboutUsOther: "",
      customMessage: "",
    },
  });

  const positionValue = form.watch("position");
  const hearAboutUsValue = form.watch("hearAboutUs");

  const mutation = useMutation({
    mutationFn: async (data: SalesInquiryFormData) => {
      return await apiRequest("/api/sales-inquiries", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your inquiry!",
        description: "We'll get back to you as soon as possible at sales@learnplay.co.za",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-inquiries"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit inquiry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SalesInquiryFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold gradient-text">
            Request Information
          </DialogTitle>
          <DialogDescription className="text-base">
            Get started with {orgName} for competitive pricing.
            <br />
            <span className="font-semibold text-success">30-day free trial • No credit card required</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="surname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Surname *</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} data-testid="input-surname" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@company.com" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+27 123 456 7890" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="organizationName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corporation" {...field} data-testid="input-organization" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Position *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-position">
                          <SelectValue placeholder="Select your position" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="HR / L&D">HR / L&D</SelectItem>
                        <SelectItem value="Trainer">Instructor</SelectItem>
                        <SelectItem value="Learner">Learner Seat</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="studentCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Learner Seats *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="50" {...field} data-testid="input-student-count" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {positionValue === "Other" && (
              <FormField
                control={form.control}
                name="positionOther"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Please specify your position</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Department Head, Administrator" {...field} value={field.value || ""} data-testid="input-position-other" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="hearAboutUs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How did you hear about us? *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-hear-about-us">
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="Google">Google</SelectItem>
                      <SelectItem value="Friend">A Friend</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hearAboutUsValue === "Other" && (
              <FormField
                control={form.control}
                name="hearAboutUsOther"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Please specify</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Facebook, Instagram, Conference" {...field} value={field.value || ""} data-testid="input-hear-about-us-other" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="customMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Message (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us more about your needs..."
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ""}
                      data-testid="textarea-message"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-submit-inquiry" >
                {mutation.isPending ? (
                  <>
                    <MessageSquare className="mr-2 h-4 w-4 animate-pulse" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Inquiry
                  </>
                )}
              </Button>

              <a
                href="https://chat.whatsapp.com/GZEdK3Xmly99SnqDnDQsw2?mode=ems_copy_t"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button type="button" variant="outline" className="w-full" data-testid="button-join-whatsapp" >
                  <SiWhatsapp className="mr-2 h-4 w-4" />
                  Join WhatsApp Group
                </Button>
              </a>
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              For immediate assistance, contact us at{" "}
              <a href="mailto:sales@learnplay.co.za" className="text-primary hover:underline">
                sales@learnplay.co.za
              </a>
            </p>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
