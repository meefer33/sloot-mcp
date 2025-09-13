import jwt from 'jsonwebtoken';

// Define the JWT payload structure
interface JWTPayload {
  u: string; // userId
  iat: number; // issued at
}

export default async function verifyJWT(
  req: any,
  res: any,
  next: any
) {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'No token provided',
      message: 'Access token is required',
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const jwtSecret = process.env.JWT_SECRET || 'slootai';
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Add user info to request object (minimal payload)
    req.user = {
      userId: decoded.u,
      token: token,
    };

    console.log('JWT verified for user:', decoded.u);
    next();
  } catch (error) {
    console.log('JWT verification failed:', (error as Error).message);
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: 'Token is invalid or expired',
    });
    return;
  }
}
