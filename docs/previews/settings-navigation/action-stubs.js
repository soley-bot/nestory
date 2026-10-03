export async function updateOrganizationIdentityAction(_state, form) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return form.get("name").includes("fail") ? { status: "error", message: "Synthetic save failed. Try again." } : { status: "success", message: "Changes saved" };
}
