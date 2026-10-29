interface SheetFieldProps {
  children: React.ReactNode;
  label: string;
}

export const SheetField = ({ children, label }: SheetFieldProps) => (
  <div>
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="mt-1">{children}</dd>
  </div>
);
