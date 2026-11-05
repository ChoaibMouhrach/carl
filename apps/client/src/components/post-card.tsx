import { formatDate, readableSkoolText } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export interface PostCardProps {
  kind: "post" | "comment";
  title: string;
  content: string;
  postedAt: string | Date;
}

export const PostCard = ({ kind, title, content, postedAt }: PostCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="wrap-anywhere">
        {title || "Untitled post"}
      </CardTitle>
      <CardDescription className="flex items-center gap-2">
        <Badge variant={kind === "post" ? "default" : "secondary"}>
          {kind === "post" ? "Post" : "Comment"}
        </Badge>
        {formatDate(postedAt)}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="whitespace-pre-wrap wrap-anywhere">
        {readableSkoolText(content) || "No text."}
      </p>
    </CardContent>
  </Card>
);
