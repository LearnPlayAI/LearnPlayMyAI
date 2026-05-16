import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Download, ExternalLink, Loader2, Share2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface Certificate {
  id: string;
  certificateId: string;
  certificateType: "course";
  learnerName: string;
  organizationName: string;
  courseTitle: string | null;
  courseId: string | null;
  xpEarned: number;
  pdfFileUrl: string | null;
  shareToken: string | null;
  sharedPlatforms: string[] | null;
  completedAt: string;
  createdAt: string;
}

export default function CertificateGallery() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const highlightedCertRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const filterCourseId = searchParams.get("course");
  const highlightCertId = searchParams.get("highlight");

  const { data, isLoading } = useQuery<{ certificates: Certificate[]; total: number }>({
    queryKey: ["/api/certificates"],
    refetchInterval: highlightCertId ? 3000 : false,
  });

  useEffect(() => {
    if (highlightCertId && data?.certificates && !hasScrolled) {
      const highlightedCert = data.certificates.find((c) => c.certificateId === highlightCertId);
      if (highlightedCert && highlightedCertRef.current) {
        setTimeout(() => {
          highlightedCertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          setHasScrolled(true);
        }, 300);
      }
    }
  }, [highlightCertId, data, hasScrolled]);

  const handleShare = async (displayCertId: string, platform: "linkedin" | "twitter" | "facebook") => {
    try {
      const response = await fetch(`/api/certificates/${displayCertId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: [platform] }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate share link");
      }

      const result = await response.json();
      const shareUrl = result.shareUrl;
      const text = `I just completed a course and earned a certificate! Check it out: ${shareUrl}`;

      let platformUrl = "";
      switch (platform) {
        case "linkedin":
          platformUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
          break;
        case "twitter":
          platformUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
          break;
        case "facebook":
          platformUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
          break;
      }

      window.open(platformUrl, "_blank", "width=600,height=400");
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });

      toast({
        title: "Share link generated",
        description: `Your certificate has been shared on ${platform}!`,
      });
    } catch (error: any) {
      toast({
        title: "Share failed",
        description: error.message || "Failed to generate share link",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (cert: Certificate) => {
    try {
      const response = await fetch(`/api/certificates/${cert.certificateId}/download`, {
        credentials: "include",
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Failed to download certificate";

        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const displayTitle = cert.courseTitle || "course";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${displayTitle.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Certificate downloaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message || "Failed to download certificate",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <QuizAdminLayout title="My Certificates" description="View and share your course achievements">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl bg-card" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl bg-card" />
            ))}
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  const allCertificates = (data?.certificates || []).filter((c) => c.certificateType === "course");
  const certificates = filterCourseId ? allCertificates.filter((c) => c.courseId === filterCourseId) : allCertificates;
  const filteredCourseName = filterCourseId && certificates.length > 0 ? certificates[0].courseTitle : null;
  const isPendingHighlight = !!highlightCertId && !certificates.find((c) => c.certificateId === highlightCertId);

  return (
    <QuizAdminLayout
      title={filterCourseId ? `Certificate for ${filteredCourseName || "Course"}` : "My Certificates"}
      description={filterCourseId ? "View your course completion certificate" : "View and share your course achievements"}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-card/50 border-border hover:border-primary/50 transition-all duration-300">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground text-xs uppercase tracking-wide">Course Certificates</CardDescription>
              <CardTitle className="text-4xl font-bold text-foreground">{certificates.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/50 transition-all duration-300">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground text-xs uppercase tracking-wide">Total XP Earned</CardDescription>
              <CardTitle className="text-4xl font-bold text-foreground">
                {certificates.reduce((sum, cert) => sum + (cert.xpEarned || 0), 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/50 transition-all duration-300">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground text-xs uppercase tracking-wide">Shared Certificates</CardDescription>
              <CardTitle className="text-4xl font-bold text-foreground">
                {certificates.filter((cert) => cert.sharedPlatforms && cert.sharedPlatforms.length > 0).length}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="bg-surface-raised border-primary/30">
            <CardHeader className="pb-3">
              <CardDescription className="text-primary text-xs uppercase tracking-wide flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Completion Focus
              </CardDescription>
              <CardTitle className="text-base font-semibold text-primary">Course Certificates Only</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {filterCourseId && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/certificates")}
              className="text-muted-foreground hover:text-foreground"
            >
              ← View all certificates
            </Button>
          </div>
        )}

        {isPendingHighlight && (
          <Card className="bg-surface-raised border-primary/40 border-2 border-dashed">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Crown className="w-12 h-12 text-primary" />
                    <Loader2 className="absolute -bottom-1 -right-1 w-5 h-5 text-primary animate-spin" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-foreground">Generating Your Certificate...</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Please wait while we create your course completion certificate
                    </CardDescription>
                  </div>
                </div>
                <Badge className="animate-pulse">In Progress</Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary hover:bg-primary/90 animate-pulse"
                  style={{ width: "70%" }}
                />
              </div>
            </CardHeader>
          </Card>
        )}

        {certificates.length === 0 && !isPendingHighlight ? (
          <Card className="bg-card/50 border-border p-12 text-center">
            <div className="relative inline-block mb-6">
              <Crown className="w-20 h-20 text-muted-foreground" />
              <Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-3">No course completion certificates yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Complete all required quizzes in a course to earn a course completion certificate.
            </p>
            <Button onClick={() => setLocation("/")}
              className="bg-primary hover:bg-primary/90 text-foreground"
              data-testid="button-browse-courses"
            >
              Browse Courses
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {certificates.map((cert) => {
              const isHighlighted = highlightCertId === cert.certificateId;
              const displayTitle = cert.courseTitle || "Course Certificate";

              return (
                <Card
                  key={cert.id}
                  ref={isHighlighted ? highlightedCertRef : undefined}
                  className={`relative transition-all duration-300 ${
                    isHighlighted
                      ? "ring-2 ring-[var(--success)] ring-offset-2 ring-offset-background shadow-lg shadow-[var(--success)]/30"
                      : ""
                  } bg-surface-raised border-border hover:border-border shadow-elevated`}
                  data-testid={`certificate-card-${cert.id}`}
                >
                  <CardHeader className="space-y-4">
                    {isHighlighted && (
                      <Badge className="absolute -top-2 -right-2 shadow-lg z-10">
                        NEW
                      </Badge>
                    )}
                    <div className="flex items-start justify-between">
                      <div className="relative">
                        <Crown className="w-16 h-16 text-primary" />
                        <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-secondary animate-pulse" />
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary" className="border" >
                          Course Completion
                        </Badge>
                        <Badge variant="secondary" data-testid={`xp-badge-${cert.id}`} >
                          +{cert.xpEarned} XP
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2 text-foreground" data-testid={`cert-title-${cert.id}`}>
                        {displayTitle}
                      </CardTitle>
                      <CardDescription className="text-muted-foreground" data-testid={`cert-org-${cert.id}`}>
                        {cert.organizationName}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 rounded-lg border space-y-1.5 bg-primary/10 border-primary/30">
                      <p className="text-xs text-muted-foreground" data-testid={`cert-id-${cert.id}`}>
                        <span className="font-semibold text-foreground">Certificate ID:</span>
                        <br />
                        <span className="font-mono text-muted-foreground">{cert.certificateId}</span>
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`cert-date-${cert.id}`}>
                        <span className="font-semibold text-foreground">Completed:</span>{" "}
                        {new Date(cert.completedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {cert.sharedPlatforms && cert.sharedPlatforms.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {cert.sharedPlatforms.map((platform) => (
                          <Badge key={platform} variant="outline" className="text-xs" >
                            Shared on {platform}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => handleDownload(cert)}
                        className="flex-1 text-foreground border-primary/40 hover:bg-primary/10 hover:border-primary/60"
                        data-testid={`download-button-${cert.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                          setSelectedCertificate(cert);
                          setShareModalOpen(true);
                        }}
                        className="flex-1 text-foreground border-primary/40 hover:bg-primary/10 hover:border-primary/60"
                        data-testid={`share-button-${cert.certificateId}`}
                      >
                        <Share2 className="w-4 h-4 mr-1" />
                        Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
          <DialogContent className="bg-card/50 border-border" data-testid="share-modal">
            <DialogHeader>
              <DialogTitle className="text-foreground">Share Your Certificate</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Choose a platform to share your achievement
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 pt-4">
              <Button onClick={() => {
                  if (selectedCertificate) {
                    handleShare(selectedCertificate.certificateId, "linkedin");
                    setShareModalOpen(false);
                  }
                }}
                className="justify-start bg-primary hover:bg-primary/90 text-foreground"
                data-testid="share-linkedin"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Share on LinkedIn
              </Button>
              <Button onClick={() => {
                  if (selectedCertificate) {
                    handleShare(selectedCertificate.certificateId, "twitter");
                    setShareModalOpen(false);
                  }
                }}
                className="justify-start bg-primary hover:bg-primary/90 text-foreground"
                data-testid="share-twitter"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Share on Twitter
              </Button>
              <Button onClick={() => {
                  if (selectedCertificate) {
                    handleShare(selectedCertificate.certificateId, "facebook");
                    setShareModalOpen(false);
                  }
                }}
                className="justify-start bg-primary hover:bg-primary/90 text-foreground"
                data-testid="share-facebook"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Share on Facebook
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
