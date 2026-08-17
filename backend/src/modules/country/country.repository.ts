import prisma from "../../config/database.js";

export const getActiveCountries  = async () => {
  return await prisma.country_master.findMany({
    where: {
      is_active: true,
    },
    orderBy: {
      country_name: "asc",
    },
  });
}