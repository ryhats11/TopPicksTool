import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Link, Copy, Check, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AffiliateLinkDropdownProps {
  clickupTaskId: string;
  subIdValue: string;
}

export function AffiliateLinkDropdown({ clickupTaskId, subIdValue }: AffiliateLinkDropdownProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ links: string[] }>({
    queryKey: ['/api/clickup/task', clickupTaskId, 'affiliate-links'],
    enabled: !!clickupTaskId,
  });

  const affiliateLinks = data?.links || [];

  const replacePayload = (url: string, newPayload: string): string => {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('payload', newPayload);
      return urlObj.toString();
    } catch (e) {
      // Fallback for malformed URLs
      return url.replace(/payload=[^&\s]+/, `payload=${newPayload}`);
    }
  };

  const handleCopyLink = async (originalUrl: string) => {
    const modifiedUrl = replacePayload(originalUrl, subIdValue);
    await navigator.clipboard.writeText(modifiedUrl);
    setCopiedUrl(originalUrl);
    toast({
      title: "Link copied!",
      description: "Affiliate link with your Sub-ID has been copied to clipboard.",
    });
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground">
        Loading links...
      </div>
    );
  }

  if (affiliateLinks.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid="button-affiliate-links"
          >
            <Link className="h-3 w-3 mr-1.5" />
            {affiliateLinks.length} Affiliate Link{affiliateLinks.length !== 1 ? 's' : ''}
            <ChevronDown className="h-3 w-3 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-96">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Click to copy with your Sub-ID
          </div>
          <DropdownMenuSeparator />
          {affiliateLinks.map((link, index) => {
            const modifiedLink = replacePayload(link, subIdValue);
            const isCopied = copiedUrl === link;
            
            return (
              <DropdownMenuItem
                key={index}
                onClick={() => handleCopyLink(link)}
                className="flex items-start gap-2 py-2 cursor-pointer"
                data-testid={`menuitem-affiliate-link-${index}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate text-foreground">
                    {modifiedLink}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Original payload: {new URL(link).searchParams.get('payload')}
                  </div>
                </div>
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
