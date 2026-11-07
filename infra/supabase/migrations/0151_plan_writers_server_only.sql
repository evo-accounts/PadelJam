-- 0151: a plan is written only by the service role (PAD-158).
-- set_account_plan and set_community_plan let any signed-in user (or community admin) grant
-- themself a paid plan without paying. The functions stay so the hidden client code and the
-- generated types still name them; only the EXECUTE grant goes. Reads are untouched.
revoke execute on function set_account_plan(text) from public, anon, authenticated;
revoke execute on function set_community_plan(uuid, text) from public, anon, authenticated;
