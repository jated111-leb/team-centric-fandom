import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CopilotChatInputProps {
  onSend: (message: string, imageUrl?: string) => void;
  isLoading: boolean;
}

export function CopilotChatInput({ onSend, isLoading }: CopilotChatInputProps) {
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files (JPEG, PNG, GIF) are supported");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    setUploading(true);
    try {
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

      setAttachedImage({ url: urlData.publicUrl, name: file.name });
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    let message = trimmed;
    if (attachedImage) {
      message += `\n\n[Attached image for push notification: ${attachedImage.url}]`;
    }

    onSend(message, attachedImage?.url);
    setInput("");
    setAttachedImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Image preview */}
        {attachedImage && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border">
            <img
              src={attachedImage.url}
              alt="Attached"
              className="h-10 w-14 object-cover rounded"
            />
            <span className="text-xs text-muted-foreground truncate flex-1">
              {attachedImage.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setAttachedImage(null)}
            >
              <X className="h-3 w-3" />
            </Button>
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
            disabled={!input.trim() || isLoading}
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
