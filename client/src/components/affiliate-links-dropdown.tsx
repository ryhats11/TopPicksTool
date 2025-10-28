import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Link, Copy, Check, ChevronDown, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AffiliateLinkDropdownProps {
  clickupTaskId: string;
  subIdValue: string;
}

// Common affiliate tracking parameter names
const affiliateParams = [
  'payload', 'subid', 'sub_id', 'clickid', 'click_id', 
  'affid', 'aff_id', 'campaign', 'campaign_id', 'tracking',
  'tracker', 'ref', 'reference', 'source', 'utm_campaign',
  'pid', 'aid', 'sid', 'cid', 'tid', 'btag', 'tag'
];

function findTrackingParam(url: string): { param: string; value: string } | null {
  try {
    const urlObj = new URL(url);
    for (const param of affiliateParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        return { param, value };
      }
    }
  } catch (e) {
    // Fallback for malformed URLs - use regex
    for (const param of affiliateParams) {
      const match = url.match(new RegExp(`${param}=([^&\\s]+)`, 'i'));
      if (match) {
        return { param, value: match[1] };
      }
    }
  }
  return null;
}

function safeGetPayload(url: string): string | null {
  const tracking = findTrackingParam(url);
  return tracking ? tracking.value : null;
}

function safeReplacePayload(url: string, newPayload: string): string {
  const tracking = findTrackingParam(url);
  if (!tracking) return url;
  
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set(tracking.param, newPayload);
    return urlObj.toString();
  } catch (e) {
    // Fallback for malformed/relative URLs
    return url.replace(
      new RegExp(`${tracking.param}=[^&\\s]+`, 'i'), 
      `${tracking.param}=${newPayload}`
    );
  }
}

export function AffiliateLinkDropdown({ clickupTaskId, subIdValue }: AffiliateLinkDropdownProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ links: string[] }>({
    queryKey: ['/api/clickup/task', clickupTaskId, 'affiliate-links'],
    enabled: !!clickupTaskId && isOpen,
  });

  const affiliateLinks = data?.links || [];

  const handleCopyLink = async (originalUrl: string) => {
    try {
      const modifiedUrl = safeReplacePayload(originalUrl, subIdValue);
      await navigator.clipboard.writeText(modifiedUrl);
      setCopiedUrl(originalUrl);
      toast({
        title: "Link copied!",
        description: "Affiliate link with your Sub-ID has been copied to clipboard.",
      });
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (e) {
      toast({
        title: "Copy failed",
        description: "Could not copy link to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mt-2">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-affiliate-links"
          >
            <Link className="h-3 w-3 mr-1.5" />
            Affiliate Links
            <ChevronDown className="h-3 w-3 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[600px] max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Loading links...
            </div>
          ) : error ? (
            <div className="px-2 py-3 text-xs text-destructive flex items-center gap-2 justify-center">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed to load affiliate links
            </div>
          ) : affiliateLinks.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No affiliate links found in task
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b sticky top-0 bg-popover">
                {affiliateLinks.length} Affiliate Link{affiliateLinks.length !== 1 ? 's' : ''} - Click to copy with your Sub-ID
              </div>
              {affiliateLinks.map((link, index) => {
                const modifiedLink = safeReplacePayload(link, subIdValue);
                const originalPayload = safeGetPayload(link);
                const isCopied = copiedUrl === link;
                
                return (
                  <DropdownMenuItem
                    key={index}
                    onClick={() => handleCopyLink(link)}
                    className="flex items-start gap-2 py-3 px-3 cursor-pointer border-b last:border-b-0"
                    data-testid={`menuitem-affiliate-link-${index}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono break-all text-foreground leading-relaxed">
                        {modifiedLink}
                      </div>
                      {originalPayload && (
                        <div className="text-xs text-muted-foreground mt-1.5 font-medium">
                          Original: {originalPayload}
                        </div>
                      )}
                    </div>
                    {isCopied ? (
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
