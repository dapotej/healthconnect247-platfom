-- The access helpers are only needed by row-level security policies and views,
-- which all apply to signed-in users. Signed-out visitors (the API's anon role)
-- have no reason to call them.
revoke execute on function public.current_app_role(), public.current_client_id(),
  public.has_role(variadic public.app_role[]) from public, anon;
grant execute on function public.current_app_role(), public.current_client_id(),
  public.has_role(variadic public.app_role[]) to authenticated;
