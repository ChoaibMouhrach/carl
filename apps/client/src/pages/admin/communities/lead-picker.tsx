import { PictureAvatar } from "@/components/picture-avatar";
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
  username: string;
  pictureUrl?: string | null;
}

interface LeadPickerProps {
  id: string;
  invalid?: boolean;
  leads: LeadOption[];
  onChange: (lead: LeadOption | null) => void;
  onSearch: (search: string) => void;
  value: LeadOption | null;
}

export const LeadPicker = ({
  id,
  invalid,
  leads,
  onChange,
  onSearch,
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
    <ComboboxInput
      aria-invalid={invalid}
      id={id}
      placeholder="Search leads by name, username or email"
      showClear
    />
    <ComboboxContent>
      <ComboboxEmpty>No leads found.</ComboboxEmpty>
      <ComboboxList>
        {(lead: LeadOption) => (
          <ComboboxItem key={lead.leadId} value={lead}>
            <PictureAvatar name={lead.name} size="sm" src={lead.pictureUrl} />
            {lead.name}
            <span className="text-muted-foreground">@{lead.username}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
);
