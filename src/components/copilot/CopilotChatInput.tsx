import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, ImagePlus, X, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CopilotChatInputProps {
  onSend: (message: string, imageUrl?: string) => void;
  isLoading: boolean;
}

// Braze push image guidelines
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (iOS limit)
const RECOMMENDED_MIN_WIDTH = 600;
const RECOMMENDED_MIN_HEIGHT = 300;
const RECOMMENDED_ASPECT_RATIO = 2; // 2:1 for Android Big Picture

interface ImageValidation {
  status: "pass" | "warn" | "fail";
  checks: { label: string; status: "pass" | "warn" | "fail"; detail: string }[];
}

function validateImageMeta(
  file: File,
  width: number,
  height: number
): ImageValidation {
  const checks: ImageValidation["checks"] = [];

  // Format check
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    checks.push({ label: "Format", status: "pass", detail: ext.toUpperCase() });
  } else {
    checks.push({ label: "Format", status: "fail", detail: `${ext.toUpperCase()} not supported` });
  }

  // Size check
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  if (file.size <= 5 * 1024 * 1024) {
    checks.push({ label: "Size", status: "pass", detail: `${sizeMB} MB` });
  } else if (file.size <= MAX_FILE_SIZE) {
    checks.push({ label: "Size", status: "warn", detail: `${sizeMB} MB (recommended < 5 MB)` });
  } else {
    checks.push({ label: "Size", status: "fail", detail: `${sizeMB} MB exceeds 10 MB limit` });
  }

  // Dimensions check
  if (width >= RECOMMENDED_MIN_WIDTH && height >= RECOMMENDED_MIN_HEIGHT) {
    checks.push({ label: "Dimensions", status: "pass", detail: `${width}×${height}` });
  } else {
    checks.push({
      label: "Dimensions",
      status: "warn",
      detail: `${width}×${height} (recommended ≥ 600×300)`,
    });
  }

  // Aspect ratio check (Android recommends 2:1)
  const ratio = width / height;
  if (Math.abs(ratio - RECOMMENDED_ASPECT_RATIO) < 0.15) {
    checks.push({ label: "Aspect ratio", status: "pass", detail: `${ratio.toFixed(1)}:1 (ideal 2:1 for Android)` });
  } else if (ratio >= 1) {
    checks.push({
      label: "Aspect ratio",
      status: "warn",
      detail: `${ratio.toFixed(1)}:1 (Android recommends 2:1)`,
    });
  } else {
    checks.push({
      label: "Aspect ratio",
      status: "warn",
      detail: `${ratio.toFixed(1)}:1 — portrait images may crop on Android`,
    });
  }

  // GIF warning
  if (ext === "gif") {
    checks.push({ label: "Animation", status: "warn", detail: "GIF supported on iOS only, static on Android" });
  }

  const hasFailure = checks.some((c) => c.status === "fail");
  const hasWarning = checks.some((c) => c.status === "warn");
  const overall = hasFailure ? "fail" : hasWarning ? "warn" : "pass";

  return { status: overall, checks };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

const statusIcon = (s: "pass" | "warn" | "fail") => {
  if (s === "pass") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
};

export function CopilotChatInput({ onSend, isLoading }: CopilotChatInputProps) {
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<{
    url: string;
    name: string;
    previewUrl: string;
    validation: ImageValidation;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic type check
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, and GIF images are supported for push notifications");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Hard size limit
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 10 MB (iOS rich notification limit)");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      // Get dimensions for validation
      const { width, height } = await getImageDimensions(file);
      const validation = validateImageMeta(file, width, height);

      // Block on hard failures
      if (validation.status === "fail") {
        toast.error("Image doesn't meet push notification requirements. See details below.");
        // Still show the validation but don't upload
        const localPreview = URL.createObjectURL(file);
        setAttachedImage({
          url: "",
          name: file.name,
          previewUrl: localPreview,
          validation,
        });
        return;
      }

      // Upload
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("copilot-assets")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        toast.error("Upload failed: " + uploadError.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("copilot-assets")
        .getPublicUrl(path);

      const localPreview = URL.createObjectURL(file);

      setAttachedImage({
        url: urlData.publicUrl,
        name: file.name,
        previewUrl: localPreview,
        validation,
      });

      if (validation.status === "warn") {
        toast.warning("Image attached with warnings — check the guidelines below");
      } else {
        toast.success("Image attached ✓");
      }
    } catch {
      toast.error("Failed to process image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = () => {
    if (attachedImage?.previewUrl) {
      URL.revokeObjectURL(attachedImage.previewUrl);
    }
    setAttachedImage(null);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Don't send if image failed validation
    if (attachedImage && attachedImage.validation.status === "fail") {
      toast.error("Fix or remove the image before sending");
      return;
    }

    let message = trimmed;
    if (attachedImage?.url) {
      message += `\n\n[Attached image for push notification: ${attachedImage.url}]`;
    }

    onSend(message, attachedImage?.url || undefined);
    setInput("");
    removeImage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = input.trim() && !isLoading && (!attachedImage || attachedImage.validation.status !== "fail");

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Image preview with validation */}
        {attachedImage && (
          <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2">
              <img
                src={attachedImage.previewUrl}
                alt="Attached"
                className="h-12 w-20 object-cover rounded border border-border"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{attachedImage.name}</span>
                  <Badge
                    variant={
                      attachedImage.validation.status === "pass"
                        ? "default"
                        : attachedImage.validation.status === "warn"
                        ? "secondary"
                        : "destructive"
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {attachedImage.validation.status === "pass"
                      ? "Ready"
                      : attachedImage.validation.status === "warn"
                      ? "Warnings"
                      : "Invalid"}
                  </Badge>
                </div>
                {/* Validation checks */}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {attachedImage.validation.checks.map((check) => (
                    <div key={check.label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {statusIcon(check.status)}
                      <span className="font-medium">{check.label}:</span>
                      <span>{check.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={removeImage}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || uploading}
            title="Attach image for push notification"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the campaign you want to send..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!canSend}
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
