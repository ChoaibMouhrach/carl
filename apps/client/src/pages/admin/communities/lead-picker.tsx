import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@repo/ui/components/ui/combobox";

export interface LeadOption {
  leadId: number;
  name: string;
  skoolUsername: string;
}

interface LeadPickerProps {
  emptyLabel: string;
  id: string;
  leads: LeadOption[];
  onChange: (lead: LeadOption | null) => void;
  onSearch: (search: string) => void;
  placeholder: string;
  value: LeadOption | null;
}

export const LeadPicker = ({
  emptyLabel,
  id,
  leads,
  onChange,
  onSearch,
  placeholder,
  value,
}: LeadPickerProps) => (
  <Combobox
    filter={null}
    isItemEqualToValue={(item, selected) => item.leadId === selected.leadId}
    items={leads}
    itemToStringLabel={(lead) => lead.name}
    onInputValueChange={(inputValue, details) => {
      if (details.reason === "input-change") onSearch(inputValue);
    }}
    onValueChange={onChange}
    value={value}
  >
    <ComboboxInput id={id} placeholder={placeholder} showClear />
    <ComboboxContent>
      <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
      <ComboboxList>
        {(lead: LeadOption) => (
          <ComboboxItem key={lead.leadId} value={lead}>
            {lead.name}
            <span className="text-muted-foreground">@{lead.skoolUsername}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
);
