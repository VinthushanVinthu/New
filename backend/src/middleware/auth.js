import jwt from "jsonwebtoken";

export const requireAuth = (roles = []) => {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token" });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    } catch (e) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};
