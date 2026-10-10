"use client";

import type { ModelDescriptor, ModelRegistry } from "@/lib/llm/models";
import { ChevronDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGatewayStore } from "@/lib/store";

interface ModelSelectorProps {
  registry: ModelRegistry;
  activeModel: ModelDescriptor;
}

export function ModelSelector({ registry, activeModel }: ModelSelectorProps) {
  const setActiveModel = useGatewayStore((state) => state.setActiveModel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Active model">
          <Sparkles className="text-primary" aria-hidden />
          <span className="max-w-32 truncate sm:max-w-none">
            {activeModel.label}
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={activeModel.id}
          onValueChange={setActiveModel}
        >
          {registry.providers.map((provider) => (
            <div key={provider.id}>
              <DropdownMenuLabel>{provider.label}</DropdownMenuLabel>
              {registry.models
                .filter((model) => model.providerId === provider.id)
                .map((model) => (
                  <DropdownMenuRadioItem key={model.id} value={model.id}>
                    {model.label}
                  </DropdownMenuRadioItem>
                ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
