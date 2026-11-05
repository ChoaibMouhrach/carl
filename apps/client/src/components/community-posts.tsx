import { PostCard, type PostCardProps } from "@/components/post-card";

interface CommunityPostsProps {
  posts: (PostCardProps & { activityId: number })[];
}

export const CommunityPosts = ({ posts }: CommunityPostsProps) => {
  if (posts.length === 0) {
    return <span className="text-muted-foreground">No posts yet</span>;
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard
          content={post.content}
          key={post.activityId}
          kind={post.kind}
          postedAt={post.postedAt}
          title={post.title}
        />
      ))}
    </div>
  );
};
