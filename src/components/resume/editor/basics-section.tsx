"use client";

import {
  Globe,
  Link as LinkIcon,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/resume/ids";
import type { ResumeBasics, ResumeLink } from "@/lib/types/resume";

interface BasicsSectionProps {
  basics: ResumeBasics;
  summary: string;
  onChangeBasics: (updated: ResumeBasics) => void;
  onChangeSummary: (summary: string) => void;
}

export function BasicsSection({
  basics,
  summary,
  onChangeBasics,
  onChangeSummary,
}: BasicsSectionProps) {
  function handleFieldChange<K extends keyof ResumeBasics>(
    key: K,
    value: ResumeBasics[K],
  ) {
    onChangeBasics({ ...basics, [key]: value });
  }

  function handleAddLink() {
    const newLink: ResumeLink = {
      id: newId("link"),
      label: "Portfolio",
      url: "https://",
    };
    handleFieldChange("links", [...(basics.links || []), newLink]);
  }

  function handleUpdateLink(index: number, updated: Partial<ResumeLink>) {
    const links = [...(basics.links || [])];
    links[index] = { ...links[index], ...updated };
    handleFieldChange("links", links);
  }

  function handleRemoveLink(index: number) {
    const links = (basics.links || []).filter((_, i) => i !== index);
    handleFieldChange("links", links);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Full Legal Name
          </label>
          <div className="relative mt-1">
            <User className="absolute left-2.5 top-2.5 size-3.5 text-zinc-500" />
            <Input
              required
              value={basics.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="pl-8 text-xs bg-zinc-900/90"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Professional Headline
          </label>
          <Input
            value={basics.headline ?? ""}
            onChange={(e) => handleFieldChange("headline", e.target.value || null)}
            placeholder="e.g. Senior Distributed Systems Engineer"
            className="mt-1 text-xs bg-zinc-900/90"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Email Address
          </label>
          <div className="relative mt-1">
            <Mail className="absolute left-2.5 top-2.5 size-3.5 text-zinc-500" />
            <Input
              type="email"
              required
              value={basics.email}
              onChange={(e) => handleFieldChange("email", e.target.value)}
              placeholder="alex@example.com"
              className="pl-8 text-xs bg-zinc-900/90"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Phone Number
          </label>
          <div className="relative mt-1">
            <Phone className="absolute left-2.5 top-2.5 size-3.5 text-zinc-500" />
            <Input
              value={basics.phone ?? ""}
              onChange={(e) => handleFieldChange("phone", e.target.value || null)}
              placeholder="+1 (555) 019-2834"
              className="pl-8 text-xs bg-zinc-900/90"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Location
          </label>
          <div className="relative mt-1">
            <MapPin className="absolute left-2.5 top-2.5 size-3.5 text-zinc-500" />
            <Input
              value={basics.location ?? ""}
              onChange={(e) => handleFieldChange("location", e.target.value || null)}
              placeholder="San Francisco, CA (or Remote)"
              className="pl-8 text-xs bg-zinc-900/90"
            />
          </div>
        </div>
      </div>

      {/* Professional Links */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/60">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Professional Links (LinkedIn, GitHub, Portfolio)
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleAddLink}
            className="h-6 text-[11px] text-indigo-400 hover:text-indigo-300 gap-1 p-1"
          >
            <Plus className="size-3" /> Add Link
          </Button>
        </div>

        {(basics.links || []).map((link, idx) => (
          <div key={link.id || idx} className="flex items-center gap-2">
            <Input
              value={link.label}
              onChange={(e) => handleUpdateLink(idx, { label: e.target.value })}
              placeholder="Label (e.g. GitHub)"
              className="w-32 text-xs bg-zinc-900/90"
            />
            <div className="relative flex-1">
              <LinkIcon className="absolute left-2.5 top-2.5 size-3 text-zinc-500" />
              <Input
                value={link.url}
                onChange={(e) => handleUpdateLink(idx, { url: e.target.value })}
                placeholder="https://github.com/..."
                className="pl-7 text-xs bg-zinc-900/90 font-mono text-[11px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => handleRemoveLink(idx)}
              className="size-8 p-0 text-zinc-500 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Career Summary */}
      <div className="pt-2 border-t border-zinc-800/60">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Executive Career Summary
        </label>
        <p className="text-[11px] text-zinc-500 mb-1.5">
          High-impact summary establishing domain mastery, years of experience, and primary stack.
        </p>
        <Textarea
          rows={3}
          value={summary}
          onChange={(e) => onChangeSummary(e.target.value)}
          placeholder="Staff engineer specializing in distributed data consensus, real-time streaming, and high-throughput microservices architecture..."
          className="text-xs bg-zinc-900/90 leading-relaxed"
        />
      </div>
    </div>
  );
}
