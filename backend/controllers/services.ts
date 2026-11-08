import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* =========================================================
   1. DISTANCE CALCULATION
========================================================= */

function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const toRadians = (value: number) => value * Math.PI / 180;
    const earthRadius = 6371.0088;

    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);

    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(longitudeDifference / 2) ** 2;

    return earthRadius * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

/* =========================================================
   2. VALIDATE CLIENT LOCATION
========================================================= */

function validateCoordinates(
    latitude: unknown,
    longitude: unknown
): { valid: boolean; message?: string } {

    if (
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {
        return {
            valid: false,
            message: 'A valid latitude is required.'
        };
    }

    if (
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        return {
            valid: false,
            message: 'A valid longitude is required.'
        };
    }

    return { valid: true };
}

/* =========================================================
   3. CONVERT CLOUDINARY PUBLIC ID TO IMAGE URL
========================================================= */

function getProfilePhotoUrl(publicId: string | null): string | null {
    if (!publicId) return null;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (!cloudName) {
        throw new Error('Cloudinary configuration is missing.');
    }

    const encodedPublicId = publicId
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');

    return `https://res.cloudinary.com/${cloudName}/image/upload/${encodedPublicId}`;
}

/* =========================================================
   4. GET NEARBY WORKERS
========================================================= */

export async function getNearbyWorkers(
    req: Request,
    res: Response
) {
    try {
        const { latitude, longitude } = req.body ?? {};

        /* VALIDATE CLIENT COORDINATES */

        const validation = validateCoordinates(
            latitude,
            longitude
        );

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        /* SEARCH SETTINGS */

        const radius = 10;
        const earthRadius = 6371.0088;

        const latitudeRange = radius / 111.32;

        const longitudeRange =
            Math.abs(Math.cos(latitude * Math.PI / 180)) < 0.000001
                ? 180
                : radius / (
                    earthRadius *
                    Math.PI / 180 *
                    Math.abs(Math.cos(latitude * Math.PI / 180))
                );

        const minLatitude = Math.max(
            -90,
            latitude - latitudeRange
        );

        const maxLatitude = Math.min(
            90,
            latitude + latitudeRange
        );

        const minLongitude = longitude - longitudeRange;
        const maxLongitude = longitude + longitudeRange;

        /* BUILD LOCATION SEARCH */

        const longitudeConditions =
            longitudeRange >= 180
                ? []
                : minLongitude < -180
                    ? [
                        {
                            longitude: {
                                gte: minLongitude + 360
                            }
                        },
                        {
                            longitude: {
                                lte: maxLongitude
                            }
                        }
                    ]
                    : maxLongitude > 180
                        ? [
                            {
                                longitude: {
                                    gte: minLongitude
                                }
                            },
                            {
                                longitude: {
                                    lte: maxLongitude - 360
                                }
                            }
                        ]
                        : [
                            {
                                longitude: {
                                    gte: minLongitude,
                                    lte: maxLongitude
                                }
                            }
                        ];

        /* FIND WORKERS WITH APPROVED SERVICES */

        const workers = await prisma.worker.findMany({
            where: {
                latitude: {
                    gte: minLatitude,
                    lte: maxLatitude
                },

                ...(longitudeConditions.length > 0 && {
                    OR: longitudeConditions
                }),

                services: {
                    some: {
                        adminApproval: 'approved'
                    }
                }
            },

            select: {
                id: true,
                fullName: true,
                profilePhoto: true,
                latitude: true,
                longitude: true,

                services: {
                    where: {
                        adminApproval: 'approved'
                    },

                    select: {
                        id: true,
                        skill: true
                    }
                }
            }
        });

        /* FILTER AND FORMAT NEARBY WORKERS */

        const nearbyWorkers: {
            workerId: string;
            fullName: string;
            profilePhoto: string | null;
            skill: string;
            serviceId: string;
            distance: number;
        }[] = [];

        for (const worker of workers) {
            const distance = calculateDistance(
                latitude,
                longitude,
                worker.latitude,
                worker.longitude
            );

            if (distance > radius) continue;

            const profilePhoto = getProfilePhotoUrl(
                worker.profilePhoto
            );

            for (const service of worker.services) {
                nearbyWorkers.push({
                    workerId: worker.id,
                    fullName: worker.fullName,
                    profilePhoto,
                    skill: service.skill,
                    serviceId: service.id,
                    distance
                });
            }
        }

        /* SORT NEAREST WORKERS FIRST */

        nearbyWorkers.sort(
            (a, b) => a.distance - b.distance
        );

        /* REMOVE INTERNAL DISTANCE FIELD */

        const formattedWorkers = nearbyWorkers.map(({
            workerId,
            fullName,
            profilePhoto,
            skill,
            serviceId
        }) => ({
            workerId,
            fullName,
            profilePhoto,
            skill,
            serviceId
        }));

        /* RETURN WORKERS */

        return res.status(200).json({
            success: true,
            workers: formattedWorkers
        });

    } catch (error) {
        console.error('Get Nearby Workers Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to find nearby workers.'
        });
    }
}