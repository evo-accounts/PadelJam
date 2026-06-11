alter table community_permissions alter column create_posts set default true;
update community_permissions set create_posts = true where create_posts = false;
